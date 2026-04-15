# Rotate the Groq API key on the VPS .env file without touching terminal
# history, logs, or any conversation transcript.
#
# Usage:  .\scripts\rotate_groq.ps1
#
# Prompts silently for the new key, pipes it to a pre-uploaded bash script
# on the VPS via ssh stdin (never as a command-line argument).

$ErrorActionPreference = 'Stop'

$VPS = 'root@187.77.220.169'
$SshKey = "$HOME\.ssh\harv_vps"
$RemoteScript = '/tmp/_rotate_groq_remote.sh'

if (-not (Test-Path $SshKey)) {
    Write-Host "ERROR: SSH key not found at $SshKey" -ForegroundColor Red
    exit 1
}

Write-Host ">> Paste the new Groq API key and press Enter (it will NOT be shown):" -ForegroundColor Cyan
$secure = Read-Host -AsSecureString
$NewKey = [System.Net.NetworkCredential]::new('', $secure).Password

if ([string]::IsNullOrWhiteSpace($NewKey)) {
    Write-Host "ERROR: empty key" -ForegroundColor Red
    exit 1
}

if (-not $NewKey.StartsWith('gsk_')) {
    $ans = Read-Host "WARNING: key doesn't start with 'gsk_' -- continue anyway? (y/N)"
    if ($ans -ne 'y' -and $ans -ne 'Y') {
        Write-Host "aborted"
        exit 1
    }
}

Write-Host ">> Updating /root/harv/.env on VPS..." -ForegroundColor Cyan

# Pipe key to ssh stdin. ssh invokes the pre-uploaded script with no
# inline bash, so quoting is not a concern.
$NewKey | & ssh -i $SshKey $VPS "bash $RemoteScript"

if ($LASTEXITCODE -ne 0) {
    Write-Host ">> Remote script failed (exit $LASTEXITCODE). Check above." -ForegroundColor Red
    exit $LASTEXITCODE
}

# Clear key material from memory
$NewKey = $null
$secure.Dispose()
[System.GC]::Collect()

Write-Host ">> Done. Tell Claude to restart harv-api and verify." -ForegroundColor Green
