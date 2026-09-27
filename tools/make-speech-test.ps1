# Makes .cache\testmedia\speech-en.wav (English speech, Windows speech synthesis) for the
# automatic subtitles test (tools/selftest-subtitles.js). Nothing to install.
Add-Type -AssemblyName System.Speech
$out = Join-Path $PSScriptRoot '..\.cache\testmedia\speech-en.wav'
New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.Rate = -1
$s.SetOutputToWaveFile($out)
$s.Speak('Hello and welcome to my channel. Today I will show you how to edit a video in five minutes. First, import your clips. Then cut the parts you do not need. Finally, add some music and export your video. Thank you for watching.')
$s.Dispose()
Write-Output $out
