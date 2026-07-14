# VOICEVOX ローカルCPU・GPUベンチマーク

このベンチマークは、ローカルPC上のVOICEVOX Engineだけに接続します。外部サービスやGoogle Cloudにはデータを送信しません。

## 測定内容

- 短文・中文・長文の3ケース
- `/audio_query`の処理時間
- `/synthesis`の処理時間
- リクエスト合計時間
- 生成音声の長さ
- RTF（音声合成時間 ÷ 生成音声時間）
- 平均、P95、最大値
- エラー件数

初期値では各ケースをウォームアップ2回、測定10回で実行します。

## 1. VOICEVOXをCPUモードで起動

VOICEVOXの設定でCPUモードを選択し、VOICEVOXを再起動します。次のURLをブラウザで開き、APIドキュメントが表示されることを確認します。

```text
http://127.0.0.1:50021/docs
```

PowerShellでリポジトリのルートへ移動し、次を実行します。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\benchmark-voicevox.ps1 -Mode CPU
```

`-ExecutionPolicy Bypass`はこのプロセスだけに適用され、PC全体のPowerShell設定は変更しません。

話者IDを固定する場合は、`-SpeakerId`を指定します。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\benchmark-voicevox.ps1 -Mode CPU -SpeakerId 1
```

指定しない場合は、VOICEVOXが返した最初のトーク用話者を使用します。

## 2. VOICEVOXをGPUモードで起動

VOICEVOXを終了し、設定をGPUモードへ変更して再起動します。CPU測定と同じ話者IDを指定します。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\benchmark-voicevox.ps1 -Mode GPU -SpeakerId 1
```

`-Mode`は測定結果のラベルです。スクリプトからVOICEVOXの実際のCPU・GPUモードは切り替えられないため、VOICEVOX側の設定と一致させてください。

Windows版VOICEVOXのローカル設定を読み取れる場合、スクリプトは設定中のCPU・GPUモードを自動確認します。`-Mode`と一致しない場合は、誤った比較結果を保存しないよう測定を停止します。

## 3. 結果を比較

結果は`benchmark-results`フォルダへ保存されます。

```text
benchmark-results/
  voicevox-cpu-YYYYMMDD-HHMMSS.csv
  voicevox-cpu-YYYYMMDD-HHMMSS-summary.json
  voicevox-gpu-YYYYMMDD-HHMMSS.csv
  voicevox-gpu-YYYYMMDD-HHMMSS-summary.json
```

生成されたCPU・GPUのCSVを指定して比較します。

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\compare-voicevox-benchmarks.ps1 `
  -CpuCsv .\benchmark-results\voicevox-cpu-YYYYMMDD-HHMMSS.csv `
  -GpuCsv .\benchmark-results\voicevox-gpu-YYYYMMDD-HHMMSS.csv
```

`GpuSpeedup`は「CPU平均時間 ÷ GPU平均時間」です。例えば`2.50`なら、GPUの合計処理時間はCPUのおよそ2.5倍高速です。

## オプション

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\benchmark-voicevox.ps1 `
  -Mode CPU `
  -BaseUrl http://127.0.0.1:50021 `
  -SpeakerId 1 `
  -Iterations 20 `
  -WarmupIterations 3 `
  -SpeedScale 1.0 `
  -VolumeScale 1.0 `
  -TimeoutSec 120
```

CPUとGPUでは、VOICEVOX Engineのバージョン、話者ID、文章、反復回数、速度、音量を同一にしてください。測定中は動画再生やゲームなど、CPU・GPUを大きく使用する処理を終了すると結果が安定します。
