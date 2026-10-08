## Boot: the Godot version of src/main.ts (content, the Game shell, controller, title screen).
extends Node

var game = null

func _ready() -> void:
	var host = PXHost.new()
	host.name = "PX"
	add_child(host)
	M_core_content.setContent(M_core_content.buildContent(ContentLoader.load_all()))
	game = M_ui_app.Game.new()
	DOM.document.body.dataset["platform"] = M_core_platform.platform
	JS.await_(game.init(DOM.document.getElementById("game")))
	var pad = M_ui_controller.installController(game, {
		"onMenu": func():
			if game.state != null and game.state.get("phase") == "desk" and not (game.scene is M_ui_scenes_title.TitleScene):
				M_ui_scenes_gamemenu.openGameMenu(game, func(): if game.scene != null: game.scene.refresh())
			else:
				M_ui_scenes_settings.openSettings(game),
		"onFightLab": func(): M_ui_scenes_fightlab.openFightLab(game),
	})
	game.goto(M_ui_scenes_title.TitleScene.new(game))
	JS.flush_microtasks()
	if OS.get_cmdline_user_args().has("--fightlab"): M_ui_scenes_fightlab.openFightLab(game)

# ---- testing: godot -- --shot out.png [--after 4] [--then <script>] saves a screenshot and quits
var _driver = null
var _shot := ""
var _shot_at := 0.0
var _t := 0.0

func _enter_tree() -> void:
	var a = OS.get_cmdline_user_args()
	var d = a.find("--drive")
	if d >= 0 and d + 1 < a.size():
		_driver = load(a[d + 1]).new()
		get_tree().create_timer(0.5).timeout.connect(func(): _driver.run(self))
	var i = a.find("--shot")
	if i >= 0 and i + 1 < a.size():
		_shot = a[i + 1]
		var j = a.find("--after")
		_shot_at = float(a[j + 1]) if j >= 0 and j + 1 < a.size() else 4.0

var _fps_t := 0.0
func _process(dt: float) -> void:
	_fps_t += dt
	if OS.get_environment("FPS") != "" and _fps_t > 1.0:
		_fps_t = 0.0
		printerr("fps %d  frame %.1f ms" % [Engine.get_frames_per_second(), dt * 1000.0])
	if _shot == "": return
	_t += dt
	if _t >= _shot_at:
		var img = get_viewport().get_texture().get_image()
		img.save_png(_shot)
		print("shot: ", _shot)
		_shot = ""
		get_tree().quit()

# ---- driver helpers (tests/drive_*.gd)
func wait(s: float) -> void:
	await get_tree().create_timer(s).timeout

func click(x: float, y: float) -> void:
	var host = PXHost.inst
	var p = Vector2(x, y)
	host._move(1.0, "mouse", p)
	host._down(1.0, "mouse", p, 0.0)
	host._up(1.0, "mouse", p, 0.0)
	JS.flush_microtasks()

func key(k: String, code := "") -> void:
	for t in ["keydown", "keyup"]:
		var ev = DOM.DomEvent.new(t)
		ev.key = k
		ev.code = code if code != "" else k
		DOM.dispatch(ev)
	JS.flush_microtasks()

func shot(path: String) -> void:
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(path)
	printerr("shot: ", path)
