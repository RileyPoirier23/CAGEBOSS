## Screen tour: screenshots of each step into $SHOTS
extends RefCounted

func run(m) -> void:
	var dir = OS.get_environment("SHOTS")
	await m.wait(3.0)
	m.click(86, 100)  # MODES
	await m.wait(1.0)
	m.click(52, 218)  # PROMOTER: PLAY
	await m.wait(2.0)
	await m.shot(dir + "/03_newgame.png")
	m.get_tree().quit()
