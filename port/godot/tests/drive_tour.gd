## Screen tour: screenshots of each step into $SHOTS
extends RefCounted

func run(m) -> void:
	var dir = OS.get_environment("SHOTS")
	await m.wait(3.0)
	m.click(86, 100)  # MODES
	await m.wait(1.0)
	m.click(52, 218)  # PROMOTER: PLAY
	await m.wait(1.5)
	m.click(420, 248)  # START
	await m.wait(5.0)
	for i in 4:
		m.click(403, 233)  # CONTINUE
		await m.wait(1.5)
	m.click(328, 155)  # I'VE GOT THIS
	await m.wait(1.0)
	m.click(428, 250)  # TO THE DESK
	await m.wait(4.0)
	await m.shot(dir + "/06_desk.png")
	await m.wait(3.0)
	await m.shot(dir + "/07_desk2.png")
	m.get_tree().quit()
