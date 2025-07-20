local net = require "luci.model.network"

local m = Map("netstats", translate("Netstat Config"),
    translate("Select your preferred primary WAN interface."))

local s = m:section(TypedSection, "config", "")
s.anonymous = true

local iface = s:option(ListValue, "prefer", translate("Preferred WAN Interface"))

local netm = net.init()
local devs = netm:get_interfaces()

iface:value("", translate("Auto detect (recommended)"))

for _, dev in ipairs(devs) do
    local name = dev:shortname()
    if name and not name:match("^lan%d?$") and not name:match("^br%-") and not name:match("^lo$") then
        iface:value(name)
    end
end

return m
