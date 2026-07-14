[CmdletBinding()]
param(
  [ValidateSet('CPU', 'GPU')]
  [string]$Mode = 'CPU',

  [string]$BaseUrl = 'http://127.0.0.1:50021',

  [int]$SpeakerId = -1,

  [ValidateRange(1, 100)]
  [int]$Iterations = 10,

  [ValidateRange(0, 20)]
  [int]$WarmupIterations = 2,

  [ValidateRange(0.5, 2.0)]
  [double]$SpeedScale = 1.0,

  [ValidateRange(0.0, 2.0)]
  [double]$VolumeScale = 1.0,

  [ValidateRange(1, 600)]
  [int]$TimeoutSec = 120,

  [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$BaseUrl = $BaseUrl.TrimEnd('/')

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path $PSScriptRoot '..\benchmark-results'
}

function Get-Percentile {
  param(
    [double[]]$Values,
    [ValidateRange(0, 100)]
    [double]$Percentile
  )

  if (-not $Values -or $Values.Count -eq 0) {
    return $null
  }

  $sorted = @($Values | Sort-Object)
  $index = [Math]::Max(0, [Math]::Ceiling(($Percentile / 100) * $sorted.Count) - 1)
  return [Math]::Round($sorted[$index], 2)
}

function Get-WavDurationMilliseconds {
  param([byte[]]$Bytes)

  if (-not $Bytes -or $Bytes.Length -lt 44) {
    return $null
  }

  $byteRate = [BitConverter]::ToUInt32($Bytes, 28)
  if ($byteRate -eq 0) {
    return $null
  }

  for ($offset = 12; $offset -le $Bytes.Length - 8;) {
    $chunkId = [Text.Encoding]::ASCII.GetString($Bytes, $offset, 4)
    $chunkSize = [BitConverter]::ToUInt32($Bytes, $offset + 4)

    if ($chunkId -eq 'data') {
      return [Math]::Round(($chunkSize / $byteRate) * 1000, 2)
    }

    $offset += 8 + $chunkSize
    if (($chunkSize % 2) -eq 1) {
      $offset++
    }
  }

  return $null
}

function Get-ResponseBytes {
  param($Response)

  if ($Response.Content -is [byte[]]) {
    return [byte[]]$Response.Content
  }

  if ($Response.RawContentStream) {
    if ($Response.RawContentStream.CanSeek) {
      $Response.RawContentStream.Position = 0
    }
    $memory = New-Object System.IO.MemoryStream
    $Response.RawContentStream.CopyTo($memory)
    return $memory.ToArray()
  }

  throw 'VOICEVOXから返されたWAVデータを読み取れませんでした。'
}

function Invoke-VoicevoxJson {
  param(
    [string]$Uri,
    [ValidateSet('Get', 'Post')]
    [string]$Method = 'Get',
    [int]$RequestTimeoutSec = $TimeoutSec
  )

  $response = Invoke-WebRequest `
    -UseBasicParsing `
    -Method $Method `
    -Uri $Uri `
    -TimeoutSec $RequestTimeoutSec
  $bytes = Get-ResponseBytes -Response $response
  $json = [Text.Encoding]::UTF8.GetString($bytes)
  return $json | ConvertFrom-Json
}

function Get-LocalVoicevoxConfiguredMode {
  if ($BaseUrl -notmatch '^https?://(127\.0\.0\.1|localhost)(:\d+)?$') {
    return $null
  }

  $configCandidates = @(
    (Join-Path $env:APPDATA 'VOICEVOX\config.json'),
    (Join-Path $env:APPDATA 'voicevox\config.json')
  ) | Select-Object -Unique
  $configPath = $configCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

  if (-not $configPath) {
    return $null
  }

  try {
    $configText = [IO.File]::ReadAllText($configPath, [Text.Encoding]::UTF8)
    $config = $configText | ConvertFrom-Json
    $configuredValues = @(
      $config.engineSettings.PSObject.Properties |
        ForEach-Object { $_.Value.useGpu } |
        Where-Object { $null -ne $_ } |
        Select-Object -Unique
    )

    if ($configuredValues.Count -eq 1) {
      return $(if ($configuredValues[0]) { 'GPU' } else { 'CPU' })
    }
  } catch {
    Write-Warning "VOICEVOX設定ファイルからCPU/GPUモードを確認できませんでした: $($_.Exception.Message)"
  }

  return $null
}

function Invoke-VoicevoxSynthesis {
  param(
    [string]$Text,
    [int]$SelectedSpeakerId
  )

  $encodedText = [Uri]::EscapeDataString($Text)
  $audioQueryUri = "$BaseUrl/audio_query?text=$encodedText&speaker=$SelectedSpeakerId"
  $synthesisUri = "$BaseUrl/synthesis?speaker=$SelectedSpeakerId"

  $totalWatch = [Diagnostics.Stopwatch]::StartNew()
  $queryWatch = [Diagnostics.Stopwatch]::StartNew()
  $audioQuery = Invoke-VoicevoxJson -Method Post -Uri $audioQueryUri
  $queryWatch.Stop()

  $audioQuery.speedScale = $SpeedScale
  $audioQuery.volumeScale = $VolumeScale
  $requestBody = $audioQuery | ConvertTo-Json -Depth 100 -Compress

  $synthesisWatch = [Diagnostics.Stopwatch]::StartNew()
  $response = Invoke-WebRequest `
    -UseBasicParsing `
    -Method Post `
    -Uri $synthesisUri `
    -ContentType 'application/json; charset=utf-8' `
    -Body ([Text.Encoding]::UTF8.GetBytes($requestBody)) `
    -TimeoutSec $TimeoutSec
  $synthesisWatch.Stop()
  $totalWatch.Stop()

  $wavBytes = Get-ResponseBytes -Response $response
  $audioDurationMs = Get-WavDurationMilliseconds -Bytes $wavBytes
  $rtf = if ($audioDurationMs -and $audioDurationMs -gt 0) {
    [Math]::Round($synthesisWatch.Elapsed.TotalMilliseconds / $audioDurationMs, 4)
  } else {
    $null
  }

  return [PSCustomObject]@{
    AudioQueryMs   = [Math]::Round($queryWatch.Elapsed.TotalMilliseconds, 2)
    SynthesisMs    = [Math]::Round($synthesisWatch.Elapsed.TotalMilliseconds, 2)
    TotalMs        = [Math]::Round($totalWatch.Elapsed.TotalMilliseconds, 2)
    AudioDurationMs = $audioDurationMs
    Rtf            = $rtf
    WavBytes       = $wavBytes.Length
  }
}

try {
  $engineVersion = (Invoke-VoicevoxJson -Method Get -Uri "$BaseUrl/version" -RequestTimeoutSec 10).ToString()
  $speakerResponse = Invoke-VoicevoxJson -Method Get -Uri "$BaseUrl/speakers" -RequestTimeoutSec 10
  $speakers = @($speakerResponse | ForEach-Object { $_ })
} catch {
  throw "VOICEVOX Engineへ接続できません。VOICEVOXを起動し、$BaseUrl/docs を確認してください。詳細: $($_.Exception.Message)"
}

$talkStyles = foreach ($speaker in $speakers) {
  foreach ($style in $speaker.styles) {
    if (-not $style.type -or $style.type -eq 'talk') {
      [PSCustomObject]@{
        SpeakerName = $speaker.name
        StyleName   = $style.name
        Id          = [int]$style.id
      }
    }
  }
}

if (-not $talkStyles) {
  throw '利用可能なトーク用話者が見つかりませんでした。'
}

$configuredMode = Get-LocalVoicevoxConfiguredMode
if ($configuredMode -and $configuredMode -ne $Mode) {
  throw "VOICEVOXの設定は${configuredMode}ですが、測定ラベルは${Mode}です。VOICEVOXのモードを確認し、再起動してから再実行してください。"
}

if ($SpeakerId -lt 0) {
  $selectedStyle = $talkStyles | Select-Object -First 1
  $SpeakerId = $selectedStyle.Id
} else {
  $selectedStyle = $talkStyles | Where-Object { $_.Id -eq $SpeakerId } | Select-Object -First 1
  if (-not $selectedStyle) {
    $availableIds = ($talkStyles.Id | Sort-Object -Unique) -join ', '
    throw "SpeakerId $SpeakerId は利用できません。利用可能なID: $availableIds"
  }
}

$cases = @(
  [PSCustomObject]@{
    Name = 'short'
    Text = '話す速度を調整しています。'
  },
  [PSCustomObject]@{
    Name = 'medium'
    Text = 'これから面接を開始します。名前と経歴または学歴をお願いします。'
  },
  [PSCustomObject]@{
    Name = 'long'
    Text = 'これまでの経験の中で、最も困難だった課題について教えてください。その課題に対してどのような目標を設定し、周囲の人とどのように協力して解決したのか、具体的な行動と結果を含めて説明してください。また、その経験から得た学びを、今後の仕事にどのように活かしたいと考えているかも教えてください。'
  }
)

Write-Host "VOICEVOX local benchmark"
Write-Host "  Mode:        $Mode"
Write-Host "  Engine:      $engineVersion"
Write-Host "  Endpoint:    $BaseUrl"
if ($configuredMode) {
  Write-Host "  Config mode: $configuredMode"
}
Write-Host "  Speaker:     $($selectedStyle.SpeakerName) / $($selectedStyle.StyleName) (ID: $SpeakerId)"
Write-Host "  Iterations:  $Iterations (warm-up: $WarmupIterations)"
Write-Host ''
Write-Warning "Mode=$Mode は測定ラベルです。VOICEVOX側が実際に同じモードで起動していることを確認してください。"

if ($WarmupIterations -gt 0) {
  Write-Host "Warm-upを実行しています..."
  for ($warmup = 1; $warmup -le $WarmupIterations; $warmup++) {
    $null = Invoke-VoicevoxSynthesis -Text $cases[1].Text -SelectedSpeakerId $SpeakerId
  }
}

$records = [Collections.Generic.List[object]]::new()

foreach ($case in $cases) {
  Write-Host "[$($case.Name)] $($case.Text)"

  for ($iteration = 1; $iteration -le $Iterations; $iteration++) {
    try {
      $measurement = Invoke-VoicevoxSynthesis -Text $case.Text -SelectedSpeakerId $SpeakerId
      $record = [PSCustomObject]@{
        Timestamp       = (Get-Date).ToString('o')
        Mode            = $Mode
        EngineVersion   = $engineVersion
        SpeakerId       = $SpeakerId
        SpeakerName     = $selectedStyle.SpeakerName
        StyleName       = $selectedStyle.StyleName
        TextCase        = $case.Name
        Iteration       = $iteration
        Characters      = $case.Text.Length
        AudioQueryMs    = $measurement.AudioQueryMs
        SynthesisMs     = $measurement.SynthesisMs
        TotalMs         = $measurement.TotalMs
        AudioDurationMs = $measurement.AudioDurationMs
        Rtf             = $measurement.Rtf
        WavBytes        = $measurement.WavBytes
        Success         = $true
        Error            = ''
      }
      $records.Add($record)
      Write-Host ("  {0,2}/{1}: total={2,8:N2} ms, synthesis={3,8:N2} ms, RTF={4}" -f $iteration, $Iterations, $record.TotalMs, $record.SynthesisMs, $record.Rtf)
    } catch {
      $records.Add([PSCustomObject]@{
        Timestamp       = (Get-Date).ToString('o')
        Mode            = $Mode
        EngineVersion   = $engineVersion
        SpeakerId       = $SpeakerId
        SpeakerName     = $selectedStyle.SpeakerName
        StyleName       = $selectedStyle.StyleName
        TextCase        = $case.Name
        Iteration       = $iteration
        Characters      = $case.Text.Length
        AudioQueryMs    = $null
        SynthesisMs     = $null
        TotalMs         = $null
        AudioDurationMs = $null
        Rtf             = $null
        WavBytes        = $null
        Success         = $false
        Error            = $_.Exception.Message
      })
      Write-Warning "  $iteration/$Iterations failed: $($_.Exception.Message)"
    }
  }
}

$summary = foreach ($case in $cases) {
  $successful = @($records | Where-Object { $_.TextCase -eq $case.Name -and $_.Success })
  $failedCount = @($records | Where-Object { $_.TextCase -eq $case.Name -and -not $_.Success }).Count

  if ($successful.Count -eq 0) {
    [PSCustomObject]@{
      Mode = $Mode; TextCase = $case.Name; SuccessCount = 0; FailureCount = $failedCount
      AverageQueryMs = $null; AverageSynthesisMs = $null; AverageTotalMs = $null
      P95TotalMs = $null; MaxTotalMs = $null; AverageAudioDurationMs = $null; AverageRtf = $null
    }
    continue
  }

  [PSCustomObject]@{
    Mode                   = $Mode
    TextCase               = $case.Name
    SuccessCount           = $successful.Count
    FailureCount           = $failedCount
    AverageQueryMs         = [Math]::Round(($successful | Measure-Object AudioQueryMs -Average).Average, 2)
    AverageSynthesisMs     = [Math]::Round(($successful | Measure-Object SynthesisMs -Average).Average, 2)
    AverageTotalMs         = [Math]::Round(($successful | Measure-Object TotalMs -Average).Average, 2)
    P95TotalMs             = Get-Percentile -Values @($successful.TotalMs) -Percentile 95
    MaxTotalMs             = [Math]::Round(($successful | Measure-Object TotalMs -Maximum).Maximum, 2)
    AverageAudioDurationMs = [Math]::Round(($successful | Measure-Object AudioDurationMs -Average).Average, 2)
    AverageRtf             = [Math]::Round(($successful | Measure-Object Rtf -Average).Average, 4)
  }
}

$resolvedOutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutputDirectory -Force | Out-Null
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$baseName = "voicevox-$($Mode.ToLowerInvariant())-$timestamp"
$csvPath = Join-Path $resolvedOutputDirectory "$baseName.csv"
$summaryPath = Join-Path $resolvedOutputDirectory "$baseName-summary.json"

$records | Export-Csv -Path $csvPath -NoTypeInformation -Encoding UTF8

$machine = [ordered]@{
  ComputerName = $env:COMPUTERNAME
  OS           = [Environment]::OSVersion.VersionString
  Processor    = @((Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue).Name)
  VideoController = @((Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue).Name)
}

$summaryDocument = [ordered]@{
  generatedAt      = (Get-Date).ToString('o')
  mode             = $Mode
  baseUrl          = $BaseUrl
  engineVersion    = $engineVersion
  speakerId        = $SpeakerId
  speakerName      = $selectedStyle.SpeakerName
  styleName        = $selectedStyle.StyleName
  iterations       = $Iterations
  warmupIterations = $WarmupIterations
  speedScale       = $SpeedScale
  volumeScale      = $VolumeScale
  machine          = $machine
  summary          = @($summary)
}

$summaryDocument | ConvertTo-Json -Depth 10 | Set-Content -Path $summaryPath -Encoding UTF8

Write-Host ''
Write-Host 'Summary'
$summary | Format-Table Mode, TextCase, SuccessCount, FailureCount, AverageTotalMs, P95TotalMs, AverageRtf -AutoSize
Write-Host "Raw CSV:      $csvPath"
Write-Host "Summary JSON: $summaryPath"

if (@($records | Where-Object { -not $_.Success }).Count -gt 0) {
  exit 2
}
