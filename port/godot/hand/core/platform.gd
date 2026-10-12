## Hand-written part of src/core/platform.ts (see tools/gdport/overrides.json).
class_name H_core_platform

## the Godot export decides: feature tags for consoles, the OS otherwise
static func detect() -> String:
	if OS.has_feature("xbox") or OS.has_feature("gdk"): return "xbox"
	if OS.has_feature("playstation") or OS.has_feature("ps5") or OS.has_feature("ps4"): return "playstation"
	match OS.get_name():
		"Android": return "android"
		"iOS": return "ios"
		"Web": return "web"
	return "desktop"
