## Loads every JSON file under res://data, keyed like the browser build ("/data/...json").
class_name ContentLoader

static func load_all() -> Dictionary:
	var out := {}
	_walk("res://data", out)
	return out

static func _walk(dir: String, out: Dictionary) -> void:
	var d := DirAccess.open(dir)
	if d == null:
		push_error("no content at " + dir)
		return
	for name in d.get_directories(): _walk(dir + "/" + name, out)
	for name in d.get_files():
		if not name.ends_with(".json"): continue
		var p := dir + "/" + name
		var f := FileAccess.open(p, FileAccess.READ)
		var v = JSON.parse_string(f.get_as_text())
		if v == null: push_error("bad JSON: " + p)
		out[p.replace("res://", "/")] = v
