"""Online beef between fighters, by how hot the feud is.
Run: python3 tools/banter_src.py  (writes templates.json -> "banter")

Each thread is an opener and a reply (and sometimes a clapback). Placeholders:
{opp} the other fighter's last name, {oppnick}, {me} the poster's last name, {weeks} weeks to the fight,
{event} the event they're booked on. Trash talk only: no crimes, no slurs.
"""
import json, os

ROOT = os.path.join(os.path.dirname(__file__), '..')

B = {
  # first sparks
  'spark_open': [
    "Funny how {opp} only got 'injured' after I asked for the fight.",
    "Ranked above {opp} and I've never even been in my prime. Think about that.",
    "{opp} trains like a guy who's never been hit. That changes soon.",
    "Somebody tell {opp} the gym has lights. He's been training in the dark apparently.",
    "{opp}'s cardio is a rumor. I'd like to confirm it.",
    "Watched {opp}'s last fight. Then I took a nap. Same experience.",
  ],
  'spark_reply': [
    "Who?",
    "Get a win over somebody with a pulse and come back to me.",
    "Lmao you're ranked by a website, relax.",
    "I've got shoes older than your career, {opp}.",
    "Tag me when your name is on a poster. A real one. Not your mom's fridge.",
    "Cute. Do you write these yourself or does your manager?",
  ],
  # it's getting real
  'heated_open': [
    "{opp}, you've been running for a year. Sign the fucking contract.",
    "Every time I say {opp}'s name his management gets a migraine. Sign it, coward.",
    "I'm gonna make {opp} famous. For the replay.",
    "{opp} blocked me. Unblock me and fight me, you soft bastard.",
    "Saw {opp} at the airport. He walked the other way. Literally.",
    "I'll fight {opp} in a parking lot for free. In the cage I want double.",
  ],
  'heated_reply': [
    "Keep my name out your mouth unless you're signing something.",
    "You've been begging for this fight longer than your marriage lasted, {opp}.",
    "{president} sends the contract, I sign it. You're the one stalling, bitch.",
    "Bro tweets like he fights. All volume, no damage.",
    "I'm gonna retire you and then go to your retirement party.",
    "I'll see you soon. Wear a cup. For your ego.",
  ],
  'heated_clap': [
    "Ratio + you're gonna get folded.",
    "Screenshotting this for after.",
    "Lmao look at him typing with his chin. Nice chin, by the way. Very breakable.",
  ],
  # nuclear
  'nuclear_open': [
    "I'm going to hurt {opp}. Not beat. Hurt. There's a difference and he knows it.",
    "{opp}, I hope your cornermen bring a stretcher. Two, actually. One for your career.",
    "Everything {opp} says is a lie except his record, and I'm about to change that too.",
    "When this is over {opp} is going to need a translator to understand his own name.",
    "I don't hate many people. I hate {opp}. Write that down.",
  ],
  'nuclear_reply': [
    "Fuck you. See you in the cage. That's the post.",
    "Every word of this is getting printed and taped to my bag. Every. Word.",
    "You won't survive the first round and you know it. Your coach knows it. Your mom knows it.",
    "Keep talking. I want you exhausted by fight night.",
    "I'm going to make you famous for the wrong reasons, {opp}.",
  ],
  # booked: fight-week energy
  'booked_open': [
    "{weeks} weeks. {opp} has {weeks} weeks left of being undefeated in his own head.",
    "{event}. Me and {opp}. Cancel your plans, he already cancelled his.",
    "Camp is done. {opp} is done. See you at {event}.",
    "{weeks} weeks till I take everything {opp} thinks he owns.",
    "Weight is perfect. Mind is perfect. {opp}'s face is about to be less perfect.",
  ],
  'booked_reply': [
    "Count it down, {opp}. I'm counting it down too. Different reasons.",
    "See you at {event}. Bring a mouthpiece. Bring two.",
    "You'll get your fight. Then you'll get your hospital bill.",
    "Hope your camp included a lot of laying down. You'll need the practice.",
    "Talk now. On fight night it's just me and you and your excuses.",
  ],
  # after they've fought
  'after_win': [
    "Told you. Told everybody. {opp} can log off now.",
    "{opp} said a lot of things. Then I said one thing with my right hand.",
    "Respect to {opp}. Just kidding. Lmao.",
  ],
  'after_loss': [
    "Run it back. Same weight, same cage, different ending.",
    "Bad night. It happens. {opp} knows it was close. Or he doesn't, he's concussed.",
    "Rematch. Name the date, {opp}. I'm not done with you.",
  ],
}


def main():
    p = os.path.join(ROOT, 'data', 'documents', 'templates.json')
    t = json.load(open(p))
    t['banter'] = B
    json.dump(t, open(p, 'w'), indent=1, ensure_ascii=False)
    print('wrote', sum(len(v) for v in B.values()), 'banter lines')


if __name__ == '__main__':
    main()
