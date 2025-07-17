module("luci.controller.admin.netip", package.seeall)

function index()
    entry({"admin", "status", "netip_status"}, call("get_netip"), nil).leaf = true
end

function get_netip()
    local netip = require "luci.netip"
    local http = require "luci.http"

    http.prepare_content("application/json")
    http.write_json(netip.get())
end
