<#
.SYNOPSIS
A prototype script to test binget Windows installations inside headless Windows Containers.

.DESCRIPTION
This script checks if Docker is running in Windows Container mode. 
If it is, it spins up a Windows Server Core image, mounts the binget binary,
and runs the install commands to verify zip/msi extractions work on Windows.

.EXAMPLE
.\test-windows-container.ps1 -BingetBin "C:\path\to\binget.exe" -Package "jq@1.7"
#>

param (
    [Parameter(Mandatory=$true)]
    [string]$BingetBin,
    
    [Parameter(Mandatory=$true)]
    [string]$Package
)

# 1. Check if docker is running and in Windows mode
$dockerInfo = docker info --format '{{.OSType}}' 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker is not running or not accessible."
    exit 1
}

if ($dockerInfo -ne 'windows') {
    Write-Error "Docker is currently set to Linux containers. Please right-click Docker Desktop and select 'Switch to Windows containers...' before running this test."
    exit 1
}

$Image = "mcr.microsoft.com/windows/servercore:ltsc2022"
Write-Host "======================================"
Write-Host "Testing $Package on Windows Server Core"
Write-Host "======================================"

# Mount the binary and run binget. 
# In Windows containers, we use powershell.exe as the entrypoint.
$dockerCmd = "docker run --rm -v ""$($BingetBin):C:\bin\binget.exe:ro"" $Image powershell.exe -Command `"
$dockerCmd += "`$env:PATH += ';C:\bin'; "
$dockerCmd += "Write-Host 'Running binget install...'; "
$dockerCmd += "binget.exe install $Package --user; "
$dockerCmd += "if (`$LASTEXITCODE -ne 0) { exit 1 }; "
$dockerCmd += "Write-Host 'Verifying installation...'; "
$dockerCmd += "Get-ChildItem -Path `$env:LOCALAPPDATA\binget\bin\ `"

Invoke-Expression $dockerCmd

if ($LASTEXITCODE -eq 0) {
    Write-Host "[SUCCESS] Windows Container Test" -ForegroundColor Green
} else {
    Write-Host "[FAILED] Windows Container Test" -ForegroundColor Red
}
