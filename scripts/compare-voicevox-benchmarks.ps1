[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$CpuCsv,

  [Parameter(Mandatory)]
  [string]$GpuCsv
)

$ErrorActionPreference = 'Stop'

function Get-Percentile {
  param(
    [double[]]$Values,
    [double]$Percentile
  )

  $sorted = @($Values | Sort-Object)
  if ($sorted.Count -eq 0) {
    return $null
  }

  $index = [Math]::Max(0, [Math]::Ceiling(($Percentile / 100) * $sorted.Count) - 1)
  return [Math]::Round($sorted[$index], 2)
}

function Get-BenchmarkSummary {
  param(
    [string]$Path,
    [string]$ExpectedMode
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "結果ファイルが見つかりません: $Path"
  }

  $rows = @(Import-Csv -LiteralPath $Path | Where-Object { $_.Success -eq 'True' })
  if ($rows.Count -eq 0) {
    throw "成功した測定結果がありません: $Path"
  }

  $actualModes = @($rows.Mode | Sort-Object -Unique)
  if ($actualModes.Count -ne 1 -or $actualModes[0] -ne $ExpectedMode) {
    throw "$Path のModeは${ExpectedMode}ではありません: $($actualModes -join ', ')"
  }

  foreach ($group in ($rows | Group-Object TextCase)) {
    $totalValues = @($group.Group | ForEach-Object { [double]$_.TotalMs })
    $rtfValues = @($group.Group | Where-Object { $_.Rtf } | ForEach-Object { [double]$_.Rtf })

    [PSCustomObject]@{
      Mode           = $ExpectedMode
      TextCase       = $group.Name
      Samples        = $group.Count
      AverageTotalMs = [Math]::Round(($totalValues | Measure-Object -Average).Average, 2)
      P95TotalMs     = Get-Percentile -Values $totalValues -Percentile 95
      AverageRtf     = if ($rtfValues.Count -gt 0) { [Math]::Round(($rtfValues | Measure-Object -Average).Average, 4) } else { $null }
    }
  }
}

$cpuSummary = @(Get-BenchmarkSummary -Path $CpuCsv -ExpectedMode 'CPU')
$gpuSummary = @(Get-BenchmarkSummary -Path $GpuCsv -ExpectedMode 'GPU')
$caseOrder = @('short', 'medium', 'long')

$comparison = foreach ($textCase in $caseOrder) {
  $cpu = $cpuSummary | Where-Object { $_.TextCase -eq $textCase } | Select-Object -First 1
  $gpu = $gpuSummary | Where-Object { $_.TextCase -eq $textCase } | Select-Object -First 1

  if (-not $cpu -or -not $gpu) {
    Write-Warning "$textCase のCPUまたはGPU結果が不足しているため比較を省略します。"
    continue
  }

  $speedup = if ($gpu.AverageTotalMs -gt 0) {
    [Math]::Round($cpu.AverageTotalMs / $gpu.AverageTotalMs, 2)
  } else {
    $null
  }

  [PSCustomObject]@{
    TextCase         = $textCase
    CpuAverageMs     = $cpu.AverageTotalMs
    GpuAverageMs     = $gpu.AverageTotalMs
    GpuSpeedup       = $speedup
    CpuP95Ms         = $cpu.P95TotalMs
    GpuP95Ms         = $gpu.P95TotalMs
    CpuAverageRtf    = $cpu.AverageRtf
    GpuAverageRtf    = $gpu.AverageRtf
    FasterMode       = if ($gpu.AverageTotalMs -lt $cpu.AverageTotalMs) { 'GPU' } else { 'CPU' }
  }
}

Write-Host 'VOICEVOX CPU / GPU comparison'
$comparison | Format-Table -AutoSize
Write-Host ''
Write-Host 'GpuSpeedupは CPU平均時間 ÷ GPU平均時間です。1.00より大きい場合、GPUのほうが高速です。'
