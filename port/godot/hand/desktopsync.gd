## Godot version of src/desktopsync.ts. Saves are already files (user://storage, see JS.local_storage),
## which is what Steam Auto-Cloud syncs; platform achievements hook in here (Steam/consoles).
class_name M_desktopsync

static func installSaveFiles() -> void: pass
static func syncPlatformAchievements() -> void: pass
static func platformAchievement(_id) -> void: pass
