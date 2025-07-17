module("luci.netip", package.seeall)

function get()
    local json = require "luci.jsonc"
    local sys = require "luci.sys"

    local result = sys.exec("curl -s https://ipinfo.io/json")
    local info = json.parse(result or "{}")

    return {
        ip = info.ip or "N/A",
        org = info.org or "N/A",
        city = info.city or "N/A",
        country = info.country or "N/A"
    }
end
