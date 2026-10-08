## Road To Champion tour
extends RefCounted

func run(m) -> void:
	var dir = OS.get_environment("SHOTS")
	await m.wait(3.0)
	m.click(86, 100)  # MODES
	await m.wait(1.0)
	m.click(146, 218)  # ROAD TO CHAMPION: PLAY
	await m.wait(3.0)
	await m.shot(dir + "/20_rtc_a.png")
	for i in 6:
		m.key("Enter")
		await m.wait(1.2)
	await m.shot(dir + "/21_rtc_b.png")
	for i in 10:
		m.key("Enter")
		await m.wait(1.0)
	await m.shot(dir + "/22_rtc_c.png")
	m.get_tree().quit()
