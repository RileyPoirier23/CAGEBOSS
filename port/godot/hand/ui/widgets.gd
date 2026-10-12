## Hand-written parts of src/ui/widgets.ts (see tools/gdport/overrides.json): text fields
## (Godot LineEdit/TextEdit over the game, in game coordinates) and file export/import.
class_name H_ui_widgets

static var _layer: CanvasLayer = null
static var _fields: Array = []
static var _font: FontFile = null

## the game's own pixel face (src/art/fontdata.ts) as a Godot bitmap font, for the text fields
static func pixel_font() -> FontFile:
	if _font != null: return _font
	var face = M_art_fontdata.MAIN_FACE
	var glyphs: Dictionary = face.get("glyphs")
	var h = int(face.get("cellHeight"))
	var ls = int(face.get("letterSpacing"))
	var chars = glyphs.keys()
	var cols = 16
	var cw = 8
	var img = Image.create(cols * cw, int(ceil(chars.size() / float(cols))) * (h + 1), false, Image.FORMAT_RGBA8)
	var f = FontFile.new()
	f.fixed_size = h
	var sz = Vector2i(h, 0)
	var ascent = h - 2
	for i in chars.size():
		var ch: String = chars[i]
		var rows: Array = glyphs[ch]
		var ox = (i % cols) * cw
		var oy = (i / cols) * (h + 1)
		var w = rows[0].length()
		for y in rows.size():
			for x in rows[y].length():
				if rows[y][x] == "#": img.set_pixel(ox + x, oy + y, Color.WHITE)
		var cp = ch.unicode_at(0)
		f.set_glyph_advance(0, h, cp, Vector2(w + ls, 0))
		f.set_glyph_offset(0, sz, cp, Vector2(0, -ascent))
		f.set_glyph_size(0, sz, cp, Vector2(w, h))
		f.set_glyph_uv_rect(0, sz, cp, Rect2(ox, oy, w, h))
		f.set_glyph_texture_idx(0, sz, cp, 0)
	f.set_glyph_advance(0, h, 32, Vector2(int(face.get("spaceWidth")) + ls, 0))
	f.set_texture_image(0, sz, 0, img)
	f.set_cache_ascent(0, h, ascent)
	f.set_cache_descent(0, h, 2)
	_font = f
	return f

static func _overlay() -> CanvasLayer:
	if _layer == null or not is_instance_valid(_layer):
		_layer = CanvasLayer.new()
		_layer.layer = 5
		PXHost.inst.add_child(_layer)
	return _layer

## a text field at game coordinates; returns {el, value(), remove()} like the browser version
static func domInput(g, x, y, w, h, value, opts = null):
	if opts == null: opts = {}
	var multiline = JS.truthy(opts.get("multiline"))
	var el: Control
	if multiline:
		var te = TextEdit.new()
		te.text = str(value)
		te.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
		el = te
	else:
		var le = LineEdit.new()
		le.text = str(value)
		if opts.get("maxLength") != null: le.max_length = int(opts.get("maxLength"))
		le.caret_blink = true
		el = le
	# the field sits in a box of exactly the game's size (Godot's minimum heights run taller)
	var box = Panel.new()
	box.position = Vector2(x, y)
	box.size = Vector2(w, h)
	box.clip_contents = true
	var sb = StyleBoxFlat.new()
	sb.bg_color = PX.color(M_art_palette.PAL.get("paper"))
	sb.border_color = PX.color(M_art_palette.PAL.get("ink"))
	sb.set_border_width_all(1)
	box.add_theme_stylebox_override("panel", sb)
	var plain = StyleBoxEmpty.new()
	plain.content_margin_left = 3.0
	plain.content_margin_right = 3.0
	el.add_theme_stylebox_override("normal", plain)
	el.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	el.add_theme_font_override("font", pixel_font())
	el.add_theme_font_size_override("font_size", int(M_art_fontdata.MAIN_FACE.get("cellHeight")))
	el.add_theme_color_override("font_color", PX.color(M_art_palette.PAL.get("ink")))
	el.add_theme_color_override("caret_color", PX.color(M_art_palette.PAL.get("ink")))
	el.add_theme_color_override("selection_color", PX.color(M_art_palette.PAL.get("gold"), 0.6))
	box.add_child(el)
	_overlay().add_child(box)
	_fields.append(box)
	var mh = el.get_combined_minimum_size().y
	el.position = Vector2(0, roundf((h - maxf(h, mh)) / 2.0))
	el.size = Vector2(w, maxf(h, mh))
	var on_change = opts.get("onChange")
	if on_change != null:
		if multiline: el.text_changed.connect(func(): JS.call_(on_change, [el.text]); JS.flush_microtasks())
		else: el.text_changed.connect(func(t): JS.call_(on_change, [t]); JS.flush_microtasks())
	# belongs to whatever is on top now; hides while something else covers it
	var owner = g.modals[g.modals.size() - 1] if g.modals.size() > 0 else (g.scene.root if g.scene != null else null)
	var owner_is_modal = g.modals.size() > 0
	var sync = func(_t = null):
		if not is_instance_valid(box): return
		var covered = (g.modals[g.modals.size() - 1] != owner) if owner_is_modal else g.modals.size() > 0
		box.visible = not covered
	g.app.ticker.add(sync)
	var remove = func():
		g.app.ticker.remove(sync)
		_fields.erase(box)
		if is_instance_valid(box): box.queue_free()
	if owner != null: owner.once("destroyed", remove)
	return {"el": el, "value": func(): return el.text if is_instance_valid(el) else "", "remove": remove}

static func removeAllDomInputs() -> void:
	for f in _fields:
		if is_instance_valid(f): f.queue_free()
	_fields.clear()

## saves to the user folder (exports/) and shows it, where the platform has a file browser
static func downloadText(name, data) -> void:
	DirAccess.make_dir_recursive_absolute("user://exports")
	var p = "user://exports/" + str(name)
	var f = FileAccess.open(p, FileAccess.WRITE)
	if f == null: return
	f.store_string(str(data))
	f.close()
	if OS.has_feature("pc"): OS.shell_show_in_file_manager(ProjectSettings.globalize_path(p))

static func pickTextFile(onText) -> void:
	if not DisplayServer.has_feature(DisplayServer.FEATURE_NATIVE_DIALOG_FILE): return
	DisplayServer.file_dialog_show("Open", OS.get_system_dir(OS.SYSTEM_DIR_DOCUMENTS), "", false, DisplayServer.FILE_DIALOG_MODE_OPEN_FILE, PackedStringArray(["*.json"]), func(ok, paths, _i):
		if not ok or paths.is_empty(): return
		var f = FileAccess.open(paths[0], FileAccess.READ)
		if f == null: return
		JS.call_(onText, [f.get_as_text()])
		JS.flush_microtasks())
