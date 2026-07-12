# UTF-8 encoding name compatible with Windows PowerShell 5.1 and PowerShell 7+.

function Get-Utf8Encoding {
    if ($PSVersionTable.PSVersion.Major -ge 7) {
        return "utf8NoBOM"
    }
    return "UTF8"
}
