<#!
.SYNOPSIS
Starts the four standalone Deriv App Builder front ends for local Profitera development.

.DESCRIPTION
Run this once, then run Django separately with `manage.py runserver` and open
http://127.0.0.1:8000/trade/. The four applications use ports 3001, 3002, 3003,
and 4003. Logs are written into the Windows temporary directory.
#>

$ErrorActionPreference = 'Stop'
$workspace = Split-Path $PSScriptRoot -Parent
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue

if (-not $nodeCommand) {
    $portableNode = Join-Path $workspace 'tools\node-v24.18.0-win-x64\node.exe'
    if (Test-Path -LiteralPath $portableNode) {
        $nodeDirectory = Split-Path $portableNode -Parent
        $env:PATH = "$nodeDirectory;$env:PATH"
    } else {
        throw 'Node.js 22+ is required. Install it, then run this script again.'
    }
}

$apps = @(
    @{ Name = 'Digits'; Folder = 'digits-app'; Port = 3001; Arguments = '--port 3001 --hostname 127.0.0.1' },
    @{ Name = 'Rise/Fall'; Folder = 'rise-fall-app'; Port = 3002; Arguments = '--port 3002 --hostname 127.0.0.1' },
    @{ Name = 'Accumulators'; Folder = 'accumulators-app'; Port = 3003; Arguments = '--port 3003 --hostname 127.0.0.1' },
    @{ Name = 'Bot'; Folder = 'bot-app'; Port = 4003; Arguments = '--host 127.0.0.1' }
)

foreach ($app in $apps) {
    $existing = Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $app.Port -State Listen -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "$($app.Name) is already listening on port $($app.Port)."
        continue
    }

    $appDirectory = Join-Path $workspace $app.Folder
    if (-not (Test-Path -LiteralPath (Join-Path $appDirectory 'node_modules'))) {
        throw "$($app.Name) dependencies are missing. Run npm install inside $appDirectory first."
    }

    $stdout = Join-Path $env:TEMP "profitera-$($app.Folder).out.log"
    $stderr = Join-Path $env:TEMP "profitera-$($app.Folder).err.log"
    $command = "npm run dev -- $($app.Arguments)"
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $command -WorkingDirectory $appDirectory -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null
    Write-Host "Starting $($app.Name) on http://127.0.0.1:$($app.Port)"
}

Write-Host 'Keep this terminal open briefly while the apps compile, then open http://127.0.0.1:8000/trade/.'
