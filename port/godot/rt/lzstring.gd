## Stand-in for the lz-string package: Godot saves are files, so they aren't compressed.
class_name LZString

static func compressToUTF16(s) -> String: return JS.str_(s)
static func decompressFromUTF16(s): return s
static func compressToBase64(s) -> String: return Marshalls.utf8_to_base64(JS.str_(s))
static func decompressFromBase64(s): return Marshalls.base64_to_utf8(JS.str_(s))
static func compressToEncodedURIComponent(s) -> String: return Marshalls.utf8_to_base64(JS.str_(s))
static func decompressFromEncodedURIComponent(s): return Marshalls.base64_to_utf8(JS.str_(s))
