param(
    [string]$HostName = '147.93.78.83',
    [string]$UserName = 'u302655234',
    [int]$Port = 65002
)
$ErrorActionPreference = 'Stop'
$workspacePath = Split-Path -Parent $PSScriptRoot
$logPath = Join-Path $workspacePath 'backend/storage/logs/hostinger-inspection.log'
Write-Host 'Enter your Hostinger SSH password at the SSH prompt. It will not be saved or echoed.'
Write-Host 'This step only inspects the server; it does not upload or change site files.'
$remoteCommand = 'pwd; php -v; command -v composer; command -v tar; ls -ld public_html domains 2>/dev/null; find domains -maxdepth 2 -type d -name public_html 2>/dev/null; df -h .'
& ssh -tt -p $Port -o ConnectTimeout=20 -o ServerAliveInterval=15 "$UserName@$HostName" $remoteCommand | Tee-Object -FilePath $logPath
$result = $LASTEXITCODE
Write-Host "SSH inspection exit code: $result"
Write-Host "Inspection log: $logPath"
Read-Host 'Press Enter to close this window'
exit $result
