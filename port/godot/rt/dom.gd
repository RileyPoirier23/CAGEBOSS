## The few browser APIs the translated UI touches (window, document, navigator, canvas 2D,
## keyboard events, gamepads), backed by Godot.
class_name DOM
extends RefCounted

static var _window = null
static var _document = null
static var _navigator = null
static var window: DOM.Win:
	get:
		if _window == null: _window = DOM.Win.new()
		return _window
static var document: DOM.Doc:
	get:
		if _document == null: _document = DOM.Doc.new()
		return _document
static var navigator: DOM.Nav:
	get:
		if _navigator == null: _navigator = DOM.Nav.new()
		return _navigator
static var location = {"search": "", "href": "godot://cageboss", "hostname": "", "protocol": "godot:", "reload": func(): pass}

# ------------------------------------------------------------------ events

class DomEvent extends RefCounted:
	var type := ""
	var key := ""
	var code := ""
	var repeat := false
	var shiftKey := false
	var ctrlKey := false
	var altKey := false
	var metaKey := false
	var isComposing := false
	var pointerType := "mouse"
	var pointerId := 1.0
	var button := 0.0
	var buttons := 0.0
	var clientX := 0.0
	var clientY := 0.0
	var deltaX := 0.0
	var deltaY := 0.0
	var movementX := 0.0
	var movementY := 0.0
	var isPrimary := true
	var target = null
	var currentTarget = null
	var detail = null
	var touches: Array = []
	var changedTouches: Array = []
	var defaultPrevented := false
	var _stopped := false
	var _stopped_now := false
	var bubbles := true
	var cancelable := true
	var isTrusted := true
	func _init(t = "", init = null) -> void:
		type = str(t)
		if init is Dictionary:
			for k in init:
				if k in self: set(k, init[k])
	func preventDefault() -> void: defaultPrevented = true
	func stopPropagation() -> void: _stopped = true
	func stopImmediatePropagation() -> void:
		_stopped = true
		_stopped_now = true

class Target extends RefCounted:
	## type -> [[fn, capture, once]]
	var _ls := {}
	## JS objects take any property
	var _extra := {}
	func _set(p: StringName, v) -> bool:
		_extra[p] = v
		return true
	func _get(p: StringName):
		return _extra.get(p)
	func addEventListener(t, fn, opts = null) -> void:
		var capture = (opts is bool and opts) or (opts is Dictionary and JS.truthy(opts.get("capture")))
		var once = opts is Dictionary and JS.truthy(opts.get("once"))
		if not _ls.has(t): _ls[t] = []
		for e in _ls[t]:
			if e[0] == fn and e[1] == capture: return
		_ls[t].append([fn, capture, once])
	func removeEventListener(t, fn, opts = null) -> void:
		var capture = (opts is bool and opts) or (opts is Dictionary and JS.truthy(opts.get("capture")))
		if not _ls.has(t): return
		var l: Array = _ls[t]
		for i in range(l.size() - 1, -1, -1):
			if l[i][0] == fn and l[i][1] == capture: l.remove_at(i)
	## phase: 1 capture, 3 bubble
	func _fire(ev, capture: bool) -> void:
		if not _ls.has(ev.type): return
		ev.currentTarget = self
		for e in _ls[ev.type].duplicate():
			if e[1] != capture: continue
			if ev._stopped_now: return
			if e[2]: removeEventListener(ev.type, e[0], e[1])
			JS.call_(e[0], [ev])
	func dispatchEvent(ev) -> bool:
		if ev.target == null: ev.target = self
		_fire(ev, true)
		if not ev._stopped_now: _fire(ev, false)
		DOM._after_synthetic(ev)
		return not ev.defaultPrevented

## window <- document <- body: capture runs window first, bubbling ends at window
static func dispatch(ev) -> void:
	ev.target = document.body
	var chain = [window, document, document.body]
	for t in chain:
		if ev._stopped: break
		t._fire(ev, true)
	for i in range(chain.size() - 1, -1, -1):
		if ev._stopped: break
		chain[i]._fire(ev, false)

## synthetic key events (the controller's virtual keys) reach the game the same way real ones do
static func _after_synthetic(_ev) -> void:
	pass

# ------------------------------------------------------------------ window / document / navigator

class Win extends DOM.Target:
	var innerWidth := 1280.0
	var innerHeight := 720.0
	var outerWidth: float:
		get: return innerWidth
	var outerHeight: float:
		get: return innerHeight
	var devicePixelRatio := 1.0
	var screen = {"width": 1920.0, "height": 1080.0, "orientation": {"type": "landscape-primary"}}
	var location:
		get: return DOM.location
	var document:
		get: return DOM.document
	var navigator:
		get: return DOM.navigator
	func open(url = null, _target = null, _features = null):
		if url != null and str(url) != "": OS.shell_open(str(url))
		return null
	func focus() -> void: pass
	func scrollTo(_a = null, _b = null) -> void: pass
	func matchMedia(q): return DOM.matchMedia(q)
	func requestAnimationFrame(f): return DOM.requestAnimationFrame(f)
	func cancelAnimationFrame(id) -> void: DOM.cancelAnimationFrame(id)
	func setTimeout(f, ms = 0.0): return JS.set_timeout(f, ms)
	func clearTimeout(id) -> void: JS.clear_timeout(id)
	func getComputedStyle(_el) -> Dictionary: return {}

class ClassList extends RefCounted:
	var _s := {}
	func add(c, _c2 = null) -> void: _s[c] = true
	func remove(c, _c2 = null) -> void: _s.erase(c)
	func contains(c) -> bool: return _s.has(c)
	func toggle(c, force = null) -> bool:
		var on = (not _s.has(c)) if force == null else bool(force)
		if on: _s[c] = true
		else: _s.erase(c)
		return on

class Element extends DOM.Target:
	var tagName := "DIV"
	var id := ""
	var style := {}
	var dataset := {}
	var classList := DOM.ClassList.new()
	var innerHTML := ""
	var textContent := ""
	var children: Array = []
	var parentElement = null
	var hidden := false
	var clientWidth: float:
		get: return DOM.window.innerWidth
	var clientHeight: float:
		get: return DOM.window.innerHeight
	func appendChild(c):
		children.append(c)
		if c is DOM.Element: c.parentElement = self
		return c
	func removeChild(c):
		children.erase(c)
		return c
	func remove() -> void:
		if parentElement != null: parentElement.removeChild(self)
	func contains(c) -> bool: return c == self or children.has(c)
	func setAttribute(k, v) -> void: set_meta(str(k).replace("-", "_"), v)
	func getAttribute(k): return get_meta(str(k).replace("-", "_"), null)
	func getBoundingClientRect() -> Dictionary:
		return {"left": 0.0, "top": 0.0, "x": 0.0, "y": 0.0, "width": DOM.window.innerWidth, "height": DOM.window.innerHeight, "right": DOM.window.innerWidth, "bottom": DOM.window.innerHeight}
	func focus(_o = null) -> void: pass
	func blur() -> void: pass
	func click() -> void: pass
	func querySelector(_s): return null
	func querySelectorAll(_s) -> Array: return []

class Doc extends DOM.Target:
	var body := DOM.Element.new()
	var documentElement := DOM.Element.new()
	var activeElement = null
	var hidden := false
	var visibilityState := "visible"
	var fullscreenElement = null
	var _by_id := {}
	func createElement(tag):
		var t = str(tag).to_lower()
		if t == "canvas": return DOM.HTMLCanvas.new()
		var e = DOM.Element.new()
		e.tagName = t.to_upper()
		return e
	func getElementById(i):
		if not _by_id.has(i):
			var e = DOM.Element.new()
			e.id = str(i)
			_by_id[i] = e
		return _by_id[i]
	func elementFromPoint(_x, _y): return null
	func querySelector(_s): return null
	func querySelectorAll(_s) -> Array: return []
	func exitFullscreen(): return JSPromise.resolve(null)

class Clipboard extends RefCounted:
	func writeText(s):
		DisplayServer.clipboard_set(str(s))
		return JSPromise.resolve(null)
	func readText():
		return JSPromise.resolve(DisplayServer.clipboard_get())

class Nav extends RefCounted:
	var _extra := {}
	func _set(p: StringName, v) -> bool:
		_extra[p] = v
		return true
	func _get(p: StringName):
		return _extra.get(p)
	var clipboard := DOM.Clipboard.new()
	var userAgent := "Godot"
	var platform := OS.get_name()
	var language := "en-CA"
	var maxTouchPoints: float:
		get: return 5.0 if DisplayServer.is_touchscreen_available() else 0.0
	var onLine := true
	func vibrate(_p = null) -> bool: return false
	## the W3C "standard" gamepad layout, from Godot's SDL-style joypad mapping
	func getGamepads() -> Array:
		var out: Array = []
		for id in Input.get_connected_joypads():
			out.append(DOM._pad(id))
		return out

const _STD_BUTTONS = [JOY_BUTTON_A, JOY_BUTTON_B, JOY_BUTTON_X, JOY_BUTTON_Y, JOY_BUTTON_LEFT_SHOULDER, JOY_BUTTON_RIGHT_SHOULDER, -1, -2, JOY_BUTTON_BACK, JOY_BUTTON_START, JOY_BUTTON_LEFT_STICK, JOY_BUTTON_RIGHT_STICK, JOY_BUTTON_DPAD_UP, JOY_BUTTON_DPAD_DOWN, JOY_BUTTON_DPAD_LEFT, JOY_BUTTON_DPAD_RIGHT, JOY_BUTTON_GUIDE]

static func _pad(id: int) -> Dictionary:
	var buttons: Array = []
	for b in _STD_BUTTONS:
		var v := 0.0
		if b == -1: v = Input.get_joy_axis(id, JOY_AXIS_TRIGGER_LEFT)
		elif b == -2: v = Input.get_joy_axis(id, JOY_AXIS_TRIGGER_RIGHT)
		else: v = 1.0 if Input.is_joy_button_pressed(id, b) else 0.0
		buttons.append({"pressed": v > 0.5, "touched": v > 0.0, "value": v})
	var axes = [Input.get_joy_axis(id, JOY_AXIS_LEFT_X), Input.get_joy_axis(id, JOY_AXIS_LEFT_Y), Input.get_joy_axis(id, JOY_AXIS_RIGHT_X), Input.get_joy_axis(id, JOY_AXIS_RIGHT_Y)]
	var rumble = {"playEffect": func(_kind = null, o = null):
		if o is Dictionary:
			Input.start_joy_vibration(id, float(o.get("weakMagnitude", 0.0)), float(o.get("strongMagnitude", 0.0)), float(o.get("duration", 150.0)) / 1000.0)
		return JSPromise.resolve("complete")}
	return {"index": float(id), "id": Input.get_joy_name(id), "connected": true, "mapping": "standard", "timestamp": float(Time.get_ticks_msec()), "buttons": buttons, "axes": axes, "vibrationActuator": rumble}

# ------------------------------------------------------------------ shutdown

## Godot frees scripts at exit before static variables: lambdas still held in static stores
## (listeners, frame callbacks) then crash the teardown. PXHost calls this on exit.
static func shutdown() -> void:
	if _window != null: _window._ls.clear()
	if _document != null:
		_document._ls.clear()
		_document.body._ls.clear()
		_document._by_id.clear()
	_raf.clear()

# ------------------------------------------------------------------ functions

static var _raf: Array = []
static var _raf_id := 0

static func requestAnimationFrame(f) -> float:
	_raf_id += 1
	_raf.append([_raf_id, f])
	return float(_raf_id)

static func cancelAnimationFrame(id) -> void:
	for i in range(_raf.size() - 1, -1, -1):
		if _raf[i][0] == int(JS.num(id)): _raf.remove_at(i)

## called once per frame by PXHost
static func run_animation_frames(now_ms: float) -> void:
	var r = _raf
	_raf = []
	for e in r: JS.call_(e[1], [now_ms])

static func matchMedia(q) -> Dictionary:
	var s = str(q)
	var m := false
	if s.contains("pointer: coarse") or s.contains("hover: none"): m = OS.has_feature("mobile")
	elif s.contains("pointer: fine") or s.contains("hover: hover"): m = not OS.has_feature("mobile")
	elif s.contains("prefers-reduced-motion"): m = false
	return {"matches": m, "media": s, "addEventListener": func(_a = null, _b = null): pass, "removeEventListener": func(_a = null, _b = null): pass}

class ResizeObserver extends RefCounted:
	func _init(_cb = null) -> void: pass
	func observe(_el = null, _o = null) -> void: pass
	func unobserve(_el = null) -> void: pass
	func disconnect_() -> void: pass

# ------------------------------------------------------------------ canvas 2D (CPU, into an Image)

class ImageData extends RefCounted:
	var width := 0.0
	var height := 0.0
	var data: Array = []
	func _init(w = 0.0, h = 0.0) -> void:
		width = float(w)
		height = float(h)
		data = JS.u8c(width * height * 4.0)

class Ctx2D extends RefCounted:
	var canvas = null
	var _fill := Color.BLACK
	var globalAlpha := 1.0
	var imageSmoothingEnabled := false
	var fillStyle:
		get: return "#" + _fill.to_html(false)
		set(v): _fill = PX.color(v)
	func fillRect(x, y, w, h) -> void:
		var img: Image = canvas._image
		var r = Rect2i(int(round(x)), int(round(y)), int(round(w)), int(round(h))).intersection(Rect2i(0, 0, img.get_width(), img.get_height()))
		if r.size.x <= 0 or r.size.y <= 0: return
		var c = _fill
		c.a *= globalAlpha
		if c.a >= 1.0:
			img.fill_rect(r, c)
		else:
			for yy in range(r.position.y, r.end.y):
				for xx in range(r.position.x, r.end.x):
					img.set_pixel(xx, yy, img.get_pixel(xx, yy).blend(c))
		canvas._dirty = true
	func clearRect(x, y, w, h) -> void:
		var img: Image = canvas._image
		var r = Rect2i(int(x), int(y), int(w), int(h)).intersection(Rect2i(0, 0, img.get_width(), img.get_height()))
		if r.size.x > 0 and r.size.y > 0: img.fill_rect(r, Color(0, 0, 0, 0))
		canvas._dirty = true
	func createImageData(w, h) -> DOM.ImageData:
		return DOM.ImageData.new(w, h)
	func getImageData(x, y, w, h) -> DOM.ImageData:
		var d = DOM.ImageData.new(w, h)
		var img: Image = canvas._image
		var i = 0
		for yy in int(h):
			for xx in int(w):
				var c = img.get_pixel(int(x) + xx, int(y) + yy)
				d.data[i] = float(c.r8)
				d.data[i + 1] = float(c.g8)
				d.data[i + 2] = float(c.b8)
				d.data[i + 3] = float(c.a8)
				i += 4
		return d
	func putImageData(d, dx = 0.0, dy = 0.0) -> void:
		var bytes := PackedByteArray()
		bytes.resize(d.data.size())
		for i in d.data.size(): bytes[i] = int(d.data[i])
		var src = Image.create_from_data(int(d.width), int(d.height), false, Image.FORMAT_RGBA8, bytes)
		canvas._image.blit_rect(src, Rect2i(0, 0, int(d.width), int(d.height)), Vector2i(int(dx), int(dy)))
		canvas._dirty = true
	func drawImage(src, dx = 0.0, dy = 0.0, _a = null, _b = null, _c = null, _d = null, _e = null, _f = null) -> void:
		if src is DOM.HTMLCanvas:
			canvas._image.blend_rect(src._image, Rect2i(0, 0, src._image.get_width(), src._image.get_height()), Vector2i(int(dx), int(dy)))
			canvas._dirty = true

class HTMLCanvas extends DOM.Element:
	var _image: Image
	var _ctx = null
	var _tex: ImageTexture = null
	var _dirty := true
	var _w := 300
	var _h := 150
	func _init() -> void:
		tagName = "CANVAS"
		_image = Image.create(_w, _h, false, Image.FORMAT_RGBA8)
	var width: float:
		get: return float(_w)
		set(v):
			_w = maxi(1, int(v))
			_image = Image.create(_w, _h, false, Image.FORMAT_RGBA8)
			_dirty = true
	var height: float:
		get: return float(_h)
		set(v):
			_h = maxi(1, int(v))
			_image = Image.create(_w, _h, false, Image.FORMAT_RGBA8)
			_dirty = true
	func getContext(_kind = "2d", _opts = null):
		if _ctx == null:
			_ctx = DOM.Ctx2D.new()
			_ctx.canvas = self
		return _ctx
	func _to_texture() -> Texture2D:
		if _tex == null:
			_tex = ImageTexture.create_from_image(_image)
		elif _dirty:
			_tex.set_image(_image)
		_dirty = false
		return _tex
	func toDataURL(_t = null) -> String: return ""

# ------------------------------------------------------------------ keyboard: Godot -> KeyboardEvent

static func key_event(e: InputEventKey) -> DOM.DomEvent:
	var ev = DOM.DomEvent.new("keydown" if e.pressed else "keyup")
	ev.repeat = e.echo
	ev.shiftKey = e.shift_pressed
	ev.ctrlKey = e.ctrl_pressed
	ev.altKey = e.alt_pressed
	ev.metaKey = e.meta_pressed
	var kc = e.keycode if e.keycode != KEY_NONE else e.physical_keycode
	var pk = e.physical_keycode if e.physical_keycode != KEY_NONE else kc
	ev.code = _code(pk)
	var named = _named(kc)
	if named != "": ev.key = named
	elif e.unicode > 0: ev.key = char(e.unicode)
	else:
		var s = OS.get_keycode_string(kc)
		ev.key = s.to_lower() if s.length() == 1 and not e.shift_pressed else s
	return ev

static func _named(k: int) -> String:
	match k:
		KEY_ESCAPE: return "Escape"
		KEY_ENTER, KEY_KP_ENTER: return "Enter"
		KEY_SPACE: return " "
		KEY_TAB: return "Tab"
		KEY_BACKSPACE: return "Backspace"
		KEY_DELETE: return "Delete"
		KEY_UP: return "ArrowUp"
		KEY_DOWN: return "ArrowDown"
		KEY_LEFT: return "ArrowLeft"
		KEY_RIGHT: return "ArrowRight"
		KEY_SHIFT: return "Shift"
		KEY_CTRL: return "Control"
		KEY_ALT: return "Alt"
		KEY_META: return "Meta"
		KEY_HOME: return "Home"
		KEY_END: return "End"
		KEY_PAGEUP: return "PageUp"
		KEY_PAGEDOWN: return "PageDown"
		KEY_CAPSLOCK: return "CapsLock"
		KEY_INSERT: return "Insert"
	if k >= KEY_F1 and k <= KEY_F12: return "F%d" % (k - KEY_F1 + 1)
	return ""

static func _code(k: int) -> String:
	if k >= KEY_A and k <= KEY_Z: return "Key" + char(k)
	if k >= KEY_0 and k <= KEY_9: return "Digit" + char(k)
	if k >= KEY_KP_0 and k <= KEY_KP_9: return "Numpad%d" % (k - KEY_KP_0)
	match k:
		KEY_SPACE: return "Space"
		KEY_ENTER: return "Enter"
		KEY_KP_ENTER: return "NumpadEnter"
		KEY_SHIFT: return "ShiftLeft"
		KEY_CTRL: return "ControlLeft"
		KEY_ALT: return "AltLeft"
		KEY_META: return "MetaLeft"
		KEY_MINUS: return "Minus"
		KEY_EQUAL: return "Equal"
		KEY_BRACKETLEFT: return "BracketLeft"
		KEY_BRACKETRIGHT: return "BracketRight"
		KEY_SEMICOLON: return "Semicolon"
		KEY_APOSTROPHE: return "Quote"
		KEY_COMMA: return "Comma"
		KEY_PERIOD: return "Period"
		KEY_SLASH: return "Slash"
		KEY_BACKSLASH: return "Backslash"
		KEY_QUOTELEFT: return "Backquote"
	var n = _named(k)
	return n if n != " " else "Space"

# ------------------------------------------------------------------ HTMLAudio (the soundtrack)

class Audio extends DOM.Target:
	var _player: AudioStreamPlayer = null
	var _src := ""
	var _volume := 1.0
	var loop := false
	var muted := false
	var paused := true
	var ended := false
	func _init(s = null) -> void:
		if s != null: src = s
	var src: String:
		get: return _src
		set(v):
			_src = str(v)
			if _player != null:
				_player.stop()
				_player.queue_free()
				_player = null
			paused = true
	var volume: float:
		get: return _volume
		set(v):
			_volume = clampf(v, 0.0, 1.0)
			if _player != null: _player.volume_db = linear_to_db(maxf(_volume, 0.0001))
	var currentTime: float:
		get: return _player.get_playback_position() if _player != null else 0.0
		set(v):
			if _player != null and _player.playing: _player.seek(v)
	var duration: float:
		get: return _player.stream.get_length() if _player != null and _player.stream != null else NAN
	## browser files are .m4a/.mp3; the Godot build ships .ogg/.mp3
	static func _stream(path: String) -> AudioStream:
		var cands = [path, path.get_basename() + ".ogg", path.get_basename() + ".mp3"]
		for c in cands:
			if ResourceLoader.exists(c): return ResourceLoader.load(c)
		return null
	func _ensure() -> bool:
		if _player != null: return true
		if PXHost.inst == null or _src == "": return false
		var st = DOM.Audio._stream(_src)
		if st == null: return false
		_player = AudioStreamPlayer.new()
		_player.stream = st
		_player.bus = "Master"
		_player.volume_db = linear_to_db(maxf(_volume, 0.0001))
		PXHost.inst.add_child(_player)
		_player.finished.connect(func():
			if loop:
				_player.play()
				return
			paused = true
			ended = true
			_fire(DOM.DomEvent.new("ended"), false))
		return true
	func play():
		if not _ensure(): return JSPromise.reject("no audio")
		if paused:
			if _player.stream_paused: _player.stream_paused = false
			else: _player.play()
		paused = false
		ended = false
		return JSPromise.resolve(null)
	func pause() -> void:
		if _player != null and _player.playing: _player.stream_paused = true
		paused = true
	func load() -> void: pass
