"""Multi-step fighter arcs: setup -> payoff weeks later (sometimes a third beat)."""
from dsl import *

FILE = 'chains_fighters'
OURS = "f.ours"


def CH(cid, steps, roles, cat='fighter', cond=None, cd=52, weight=8, tags=None, acts=None, vars=None):
    """steps: [(id, title, scenes, choices)]; first is random-eligible, the rest are follow-ups."""
    for i, (sid, title, scenes, choices) in enumerate(steps):
        S(FILE, sid, title, cat, scenes, choices, roles=roles, cond=cond if i == 0 else None, cd=cd, weight=weight,
          chain=cid, fu=i > 0, tags=tags, acts=acts if i == 0 else None, vars=vars)


# ---------------------------------------------------------------- the comeback kid
CH('ch_comeback_kid', [
    ('ck_slump', 'The Slump', [visit("{subject.first} {subject.last} sits in your office with {his} hood up. Three losses in a row. 'I think I'm done, boss. My hands don't listen anymore.'", "{subject.first} {subject.last}")],
     [C("Send {him} to a new camp, your treat ({$fee})", "spend('camp', vars.fee)", "subject.morale += 10", "follow('ck_camp', 6)", result="{He} packs a bag for a gym in the mountains run by a man who only communicates in grunts.", ethics=1, default=True),
      C("Book {him} a softer opponent", "subject.morale += 4", "follow('ck_tuneup', 4)", result="A tune-up fight. Everybody knows what it is. Nobody says it out loud.", bot=1),
      C("Suggest retirement", "subject.morale -= 10", "subject.loyalty -= 6", result="{He} leaves without a word. {He} doesn't retire. {He} just stops answering your calls.")]),
    ('ck_camp', 'Mountain Camp', [sc('social', "{subject.first} posts from the mountain camp: chopping wood, carrying rocks uphill, sparring a guy named Grizz who has never lost a street fight or a tooth. {He} looks... different. Hungry.")],
     [C("Book {him} against a ranked name", "subject.hype += 8", "subject.skills.heart += 2", "follow('ck_payoff', 6)", result="The fans call it a mismatch. {He} calls it Tuesday.", bot=2, default=True),
      C("Let {him} take another tune-up", "subject.morale += 4", result="{He} wins easy. {He} wanted harder.")]),
    ('ck_tuneup', 'The Tune-Up', [sc('narration', "The tune-up opponent showed up 14 pounds heavy and smelling of beer. {subject.first} wins in 40 seconds. Nobody is impressed. {He} isn't either.")],
     [C("Fine. Give {him} a real test next.", "subject.morale += 6", "follow('ck_payoff', 8)", result="{He} nods. That's the first time {he}'s nodded in months.", default=True)]),
    ('ck_payoff', 'The Comeback', [sc('headline', "THE COMEBACK IS REAL: {subject.last} looks like a new fighter. Social media is calling it 'the redemption arc', 'the glow up' and, for some reason, 'the {pop_movie} montage'.")],
     [C("Give {him} a raise and a contract extension", "raise(subject, 15)", "subject.loyalty += 12", "fans += 2", result="{He} signs and hugs you for slightly too long.", default=True, ethics=1),
      C("Ride the hype into a title eliminator", "subject.hype += 12", "fans += 3", "network += 1", result="One more win and {he}'s fighting for gold. The documentary crew is already following {him}.", bot=2)]),
], {"subject": F(OURS + " && f.streak <= -2 && f.age < 36")}, vars={"fee": money(10, 30)}, cd=104)

# ---------------------------------------------------------------- weight bully
CH('ch_weight_bully', [
    ('wb_cut', 'The Big Cut', [phone("{subject.first} wants to drop a weight class. {He} walks around 38 pounds over the new limit. {His} nutritionist has resigned. {His} new nutritionist is a guy from the gym who 'read a lot about water'.", "{subject.manager}")],
     [C("Approve the move down", "follow('wb_weighin', 5)", "subject.morale += 4", result="{He} starts living in a sauna suit. Neighbors report a 'sweaty ghost' jogging at night.", bot=2),
      C("Make {him} hire a real nutritionist ({$fee})", "spend('nutrition', vars.fee)", "follow('wb_weighin', 5)", "subject.weightMisses -= 1", result="The real nutritionist cries a little when she sees {his} meal plan. Then she fixes it.", ethics=1, default=True),
      C("Deny it", "subject.morale -= 5", result="{He} stays put and complains about being 'the smallest heavy guy in the world'.")]),
    ('wb_weighin', 'Death March to the Scale', [sc('narration', "Weigh-in morning. {subject.first} is grey, shaking, and has asked twice what year it is. The scale reads exactly the limit. {He} raises both arms and nearly faints into the commission inspector.")],
     [C("Get {him} IV fluids and a doctor", "spend('medical', 4000 * scale)", "subject.morale += 4", "commission += 1", result="{He} rehydrates 17 pounds overnight. The opponent looks like a child next to {him}.", default=True, ethics=1),
      C("Leave it. {He} made weight.", "subject.damage += 3", "chance(0.25) ? injure(subject, 4, 'kidney trouble') : meter('fans', 1)", result="{He} looks rough. {He} fights rough.", bot=1)]),
], {"subject": F(OURS + " && f.age < 33")}, vars={"fee": money(3, 8)}, cd=104)

# ---------------------------------------------------------------- the prodigy
CH('ch_prodigy', [
    ('pr_found', 'The Kid Everyone Is Talking About', [sc('social', "A 19-year-old named {subject.first} {subject.last} has a highlight reel going viral: six first-round finishes, one of them with a cartwheel kick. {He}'s on your roster. Rival promotions are already DMing {him} fire emojis.")],
     [C("Lock {him} into a long contract now", "subject.loyalty += 10", "raise(subject, 25)", "follow('pr_media', 4)", result="{His} mom signs as a witness. She cries. {He} asks if the contract comes with a car.", bot=2, default=True),
      C("Let {him} develop slowly", "subject.morale -= 2", "follow('pr_poach', 6)", result="Slow and steady. {His} manager thinks slow and steady is for tortoises.")]),
    ('pr_media', 'Too Much Too Soon', [sc('headline', "Is {subject.last} the future of the sport? The kid has done 14 interviews this week, a cereal ad, and a podcast with {pop_streamer}. {He} hasn't trained in nine days.")],
     [C("Shut the media tour down", "subject.morale -= 4", "subject.skills.fightIQ += 1", result="{He} sulks, then trains. Then sulks while training.", ethics=1, default=True),
      C("More media. Strike while hot.", "subject.hype += 10", "fans += 2", "subject.skills.cardio -= 2", result="{He} gasses in round two next time. But the cereal sells out.", bot=2)]),
    ('pr_poach', 'The Poach Attempt', [phone("A rival promotion offered {subject.first} triple {his} purse plus a signing bonus 'in crypto'. {He} hasn't said yes. {He} hasn't said no. {He} sent you a screenshot with a thinking emoji.", "{subject.manager}")],
     [C("Match it", "raise(subject, 50)", "subject.loyalty += 15", result="Expensive. {He} stays. {His} manager buys a boat.", bot=1, default=True),
      C("Call the bluff", "chance(0.5) ? toRival(subject) : meter('fighters', 1)", result="Sometimes the bluff works. Sometimes the kid becomes someone else's future.")]),
], {"subject": F(OURS + " && f.age <= 22 && f.potential > 70")}, cd=156)

# ---------------------------------------------------------------- the veteran's last run
CH('ch_last_run', [
    ('lr_ask', 'One Last Run', [visit("{subject.first} {subject.last}, {subject.age}, sets {his} old gloves on your desk. 'Give me three more fights. If I lose one, I walk. If I win them all, I want a title shot.'", "{subject.first} {subject.last}")],
     [C("Deal", "subject.morale += 10", "subject.hype += 6", "setFlag('last_run_' + subject.id, 1)", "follow('lr_mid', 10)", result="You shake on it. {His} handshake is still terrifying.", default=True),
      C("Offer a coaching job instead", "subject.morale -= 6", "fighters += 1", result="'Coaching is for people who can't fight.' {He} leaves. {He} comes back the next day to ask about the dental plan.")]),
    ('lr_mid', 'Halfway There', [sc('narration', "{subject.first} is two fights into the last run and looks ten years younger. {His} knees look twenty years older. The fans have started chanting {his} name at the weigh-ins.")],
     [C("Promote the hell out of it", "subject.hype += 10", "fans += 3", "follow('lr_end', 10)", result="'THE LAST RUN' trends for a week. {He} pretends not to read it. {He} reads all of it.", bot=2, default=True),
      C("Quietly have the doctors check {him}", "spend('medical', 5000 * scale)", "subject.damage -= 2", "follow('lr_end', 10)", result="The doctors say {he}'s fine for {his} age. They say 'for your age' four times.", ethics=1)]),
    ('lr_end', 'The Ride Into the Sunset', [visit("{subject.first} comes by after {his} last fight of the run, win or lose, with a framed photo of {him} and you at {his} first fight. 'Thank you. I'm done. I mean it this time.'", "{subject.first} {subject.last}")],
     [C("Throw {him} a retirement ceremony in the cage", "retire(subject)", "fans += 4", "fighters += 3", "media += 2", result="The whole arena stands. {He} leaves the gloves in the center of the cage. Juiced Butler cries. Juiced Butler denies crying.", default=True),
      C("'One more?'", "subject.morale += 3", "subject.damage += 5", result="{He} laughs. Then {he} thinks about it. Oh no.", bot=1)]),
], {"subject": F(OURS + " && f.age >= 35 && f.status == 'active'")}, cd=156)

# ---------------------------------------------------------------- sparring war
CH('ch_sparring_war', [
    ('sw_leak', 'Sparring Footage Leaks', [sc('social', "Grainy phone footage from a closed gym: {subject.first} getting dropped in sparring by {other.first} {other.last}. 3 million views. {subject.last} insists {he} 'tripped on a kettlebell'.")],
     [C("Make the fight for real", "rivalry(subject, other)", "subject.hype += 8", "other.hype += 10", "follow('sw_pressers', 4)", result="Now it's personal. The kettlebell is reportedly 'staying neutral'.", bot=2),
      C("Find out who leaked it", "media -= 1", "follow('sw_mole', 3)", result="You start an investigation. The gym's WiFi password was 'password'.", default=True)]),
    ('sw_mole', 'The Leaker', [sc('narration', "The leaker was {other.last}'s cousin, who ran a fan account and 'thought it was cool'. {subject.last} wants him banned from all events. {other.last} wants him promoted to social media manager.")],
     [C("Ban the cousin", "subject.morale += 4", "other.morale -= 4", result="The cousin posts a 40-tweet thread about it. More views than the fight.", default=True),
      C("Hire the cousin", "fans += 2", "subject.morale -= 6", "media += 1", result="He's great at it. Unbelievably great. You hate how good he is.", bot=2)]),
    ('sw_pressers', 'The Kettlebell Presser', [sc('presser', "At the press conference, {other.first} brings a kettlebell and sets it on the table. {subject.first} picks it up, looks at it, and throws it into the crowd. Nobody is hurt. A reporter keeps it.")],
     [C("Fine {subject.last} (publicly)", "commission += 2", "subject.beef += 6", result="{He} pays the fine in coins. Seventy pounds of coins.", default=True),
      C("Sell kettlebell merch", "earn('merch', 30000 * scale)", "fans += 2", result="Signed kettlebells sell out in an hour. Shipping costs are a nightmare.", bot=2)]),
], {"subject": F(OURS + " && f.hype > 30"), "other": F(OURS + " && f.id != subject.id && f.division == subject.division")}, cd=104)

# ---------------------------------------------------------------- the family business
CH('ch_family', [
    ('fam_dad', 'Dad Wants In', [visit("{subject.first}'s father has appointed himself 'head coach, manager and spiritual adviser'. He's wearing a headset. Nobody gave him a headset.", "{subject.first}'s dad")],
     [C("Let dad run the corner", "subject.morale += 6", "follow('fam_corner', 4)", result="Dad's first instruction is 'HIT HIM'. Second is 'HIT HIM HARDER'. Strategy.", bot=2),
      C("Politely remove dad", "subject.morale -= 6", "subject.loyalty -= 3", "follow('fam_grudge', 8)", result="Dad leaves. Dad will remember.", default=True)]),
    ('fam_corner', "Dad's Corner", [sc('fightnight', "Between rounds, {subject.first}'s dad slaps {him} across the face 'to wake him up', yells at the cutman, and argues with the ring card girl about the round number. The broadcast picks it all up.")],
     [C("Let it ride. It's great TV.", "fans += 3", "network += 1", "subject.skills.fightIQ -= 1", result="The clip goes everywhere. Dad starts a podcast.", bot=2),
      C("Replace dad with a real coach", "subject.morale -= 3", "subject.skills.fightIQ += 2", result="Dad watches from the stands. Loudly.", default=True, ethics=1)]),
    ('fam_grudge', "Dad's Revenge", [sc('social', "{subject.first}'s dad has started a rival gym across the street and is telling anyone who listens that {president} 'stole his son'. He's also selling T-shirts. They're good T-shirts.")],
     [C("Make peace: invite him to the next event", "subject.morale += 6", "subject.loyalty += 4", result="Dad comes. Dad behaves. Dad sneaks into the cage after the fight to hug his boy.", default=True, ethics=1),
      C("Ignore him", "media -= 1", result="The T-shirt says '{presidentLast} OWES ME A SANDWICH'. It's everywhere.")]),
], {"subject": F(OURS + " && f.age < 30")}, cat='family', cd=104)

# ---------------------------------------------------------------- the reluctant superstar
CH('ch_reluctant_star', [
    ('rs_shy', 'The Shy Killer', [sc('narration', "{subject.first} {subject.last} has finished five straight opponents and gives post-fight interviews in a whisper. Fans love the fights. Marketing is losing its mind. The kid just wants to go home and play {pop_game}.")],
     [C("Hire a media coach ({$fee})", "spend('media', vars.fee)", "follow('rs_coach', 4)", result="The media coach's first exercise is 'say your own name loudly'. It takes two days.", bot=1, default=True),
      C("Lean into it: 'The Silent Assassin'", "subject.hype += 10", "fans += 2", result="Merch with a finger over lips. It sells. {He} still won't do interviews.", bot=2)]),
    ('rs_coach', 'The Big Interview', [sc('narration', "{subject.first}'s first big interview: a sit-down with Joe Brogan. Four hours. {He} says eleven words. Three of them are 'yeah'. The internet decides it's the most mysterious interview of all time.")],
     [C("Embrace the mystery", "subject.hype += 12", "fans += 3", result="The mystery becomes the brand. Brogan does a three-hour episode about the eleven words.", default=True, bot=2),
      C("Keep coaching", "subject.morale -= 3", "media += 2", result="By the next presser, {he} says a full sentence. It's 'I'm going to win'. The crowd erupts.")]),
], {"subject": F(OURS + " && f.traits.has('Shy') && f.streak >= 2")}, vars={"fee": money(5, 15)}, cd=104)

# ---------------------------------------------------------------- frenemies
CH('ch_frenemies', [
    ('fr_refuse', 'We Will Never Fight', [visit("Training partners {subject.first} {subject.last} and {other.first} {other.last} are ranked one and two. They walk in together, holding the same protein shake. 'We don't fight each other. Ever.'", "{subject.first} & {other.first}")],
     [C("Respect it", "subject.loyalty += 6", "other.loyalty += 6", "fans -= 1", result="Fans call it cowardice. The two of them call it brotherhood. You call it a headache.", default=True, ethics=1),
      C("Offer them both double to fight", "follow('fr_crack', 6)", "subject.morale -= 3", "other.morale -= 3", result="They look at each other. They look at the number. They look at each other again.", bot=2)]),
    ('fr_crack', 'The Crack', [sc('social', "{subject.first} unfollowed {other.first}. {other.first} posted a cryptic quote about 'snakes in the garden'. Their gym has split down the middle. Even the gym cat had to pick a side.")],
     [C("Book it", "rivalry(subject, other)", "subject.hype += 12", "other.hype += 12", "fans += 3", result="Former best friends. The promo writes itself. The cat attends the weigh-in.", bot=2, default=True),
      C("Try to repair it", "subject.morale += 3", "other.morale += 3", "media += 1", result="You buy them lunch. They split the bill. Small progress.", ethics=1)]),
], {"subject": F(OURS + " && f.rank >= 1 && f.rank <= 5"), "other": F(OURS + " && f.id != subject.id && f.division == subject.division && f.gym == subject.gym")}, cd=104)

# ---------------------------------------------------------------- the influencer fight
CH('ch_influencer_fight', [
    ('if_callout', 'The Influencer Callout', [sc('social', "{pop_streamer} has called out {subject.first} {subject.last} for 'a real fight, no headgear, winner gets the loser's car'. The video has 14 million views. {subject.last} replied with a single word: 'bet'.")],
     [C("Sanction the exhibition", "earn('ppv', 200000 * scale)", "fans -= 2", "network += 3", "follow('if_fight', 6)", result="Purists hate it. Everyone watches it.", bot=2),
      C("Forbid it", "subject.morale -= 6", "fans += 1", result="{He} responds 'bet' to you as well. You're not sure what that means.", default=True)]),
    ('if_fight', 'Influencer Fight Night', [sc('fightnight', "The influencer walks out on a hoverboard with a 40-person entourage. {subject.first} walks out alone. It lasts 31 seconds. The influencer's car is a {pop_car}.")],
     [C("Let {subject.first} keep the car", "subject.morale += 10", "subject.hype += 10", result="{He} drives it to every press conference for a year.", default=True),
      C("Auction the car for charity", "media += 3", "fans += 2", "subject.morale += 3", result="It sells for a fortune to a man who wants to 'feel what it felt'.", ethics=2)]),
], {"subject": F(OURS + " && f.hype > 40 && !f.parody")}, cd=156)

# ---------------------------------------------------------------- injury secrets
CH('ch_hidden_injury', [
    ('hi_whisper', 'The Limp', [sc('narration', "Your cutman pulls you aside: {subject.first} has been limping out of practice all week and icing a knee in the parking lot so nobody sees. {He} fights in two weeks.")],
     [C("Send {him} for an MRI", "spend('medical', 6000 * scale)", "follow('hi_mri', 1)", result="{He} goes, swearing the whole way.", default=True, ethics=1),
      C("Don't ask, don't tell", "follow('hi_fight', 2)", result="The show must go on. The knee must go on.", bot=2, ethics=-2)]),
    ('hi_mri', 'The MRI', [doc("MRI RESULTS: partial MCL tear. Recommended rest: 6-8 weeks. Fighter's handwritten note in margin: 'its fine'.", "MEDICAL IMAGING REPORT")],
     [C("Pull {him} from the card", "injure(subject, 7, 'MCL tear')", "subject.loyalty += 4", "subject.morale -= 6", result="{He} is furious. {His} knee is relieved.", default=True, ethics=2),
      C("Let {him} fight with a brace", "subject.damage += 4", "chance(0.4) ? injure(subject, 14, 'torn ACL') : meter('fans', 1)", result="The brace is visible on the broadcast. Blow Hogan talks about it for an entire round.", bot=1, ethics=-1)]),
    ('hi_fight', 'The Knee Gives', [sc('fightnight', "Round one. {subject.first} plants to throw a hook and the knee simply leaves. The crowd groans. Lon Anik says 'oh no' in a voice you've never heard before.")],
     [C("Pay all the surgery costs", "injure(subject, 26, 'blown knee')", "spend('medical', 40000 * scale)", "subject.loyalty += 8", result="Expensive. Correct.", default=True, ethics=1),
      C("Point to the waiver {he} signed", "injure(subject, 26, 'blown knee')", "subject.loyalty -= 15", "fighters -= 4", "media -= 3", result="The whole roster saw that.", bot=1, ethics=-3)]),
], {"subject": F(OURS + " && f.booked && f.traits.has('Injury Prone')")}, cd=104)

# ---------------------------------------------------------------- the brand
CH('ch_clothing_line', [
    ('cl_launch', 'The Clothing Line', [sc('social', "{subject.first} is launching a clothing line called '{subject.nick} Wear'. The first item is a hoodie with {his} own face on it, crying. 'It's ironic,' {he} explains.")],
     [C("Partner with {him} on it", "spend('merch', 20000 * scale)", "follow('cl_results', 8)", "subject.loyalty += 4", result="Your logo goes on the sleeve. Next to the crying face.", bot=1),
      C("Stay out of it", "follow('cl_results', 8)", result="{He} launches it alone. The website crashes.", default=True)]),
    ('cl_results', 'Hoodie Results', [sc('headline', "{subject.last}'s crying-face hoodie becomes an unexpected hit; spotted on {pop_celeb} at an airport.")],
     [C("Take your cut", "earn('merch', 60000 * scale)", "subject.morale += 4", result="Ironic hoodies: the future of combat sports revenue.", default=True),
      C("Let {him} keep it all", "subject.loyalty += 10", "subject.morale += 8", result="{He} buys {his} mom a house. {His} mom wears the hoodie.", ethics=1)]),
], {"subject": F(OURS + " && f.followers > 50000")}, cat='business', cd=104)

# ---------------------------------------------------------------- the rival gym war
CH('ch_gym_war', [
    ('gw_start', 'Gym Wars', [sc('social', "{subject.gym} and {other.gym} are at war. Someone keyed a car. Someone stole the other gym's mascot (a large inflatable gorilla named Kevin). Both gyms have fighters on your next card.")],
     [C("Book them against each other", "rivalry(subject, other)", "subject.hype += 6", "other.hype += 6", "follow('gw_night', 4)", result="Gym vs gym. Kevin the gorilla will be cageside.", bot=2),
      C("Mediate", "follow('gw_summit', 2)", result="You set up a summit. At a Denny's.", default=True)]),
    ('gw_summit', 'The Denny\'s Summit', [sc('narration', "Both head coaches meet at a Denny's at 2am. Within 15 minutes, there's a dispute over the last pancake. Within 16, there's a truce: Kevin goes back, and both gyms ban the car keyer.")],
     [C("Celebrate the peace", "fighters += 2", "media += 1", result="Peace in our time. Kevin is returned with a new hat.", default=True, ethics=1)]),
    ('gw_night', 'Gym War Night', [sc('fightnight', "Both gyms fill opposite sections of the arena. Chants go back and forth all night. Kevin the gorilla is inflated cageside and deflated by security twice.")],
     [C("Embrace the chaos", "fans += 3", "commission -= 1", "chaos += 2", result="Best atmosphere of the year. The cleaning crew disagrees.", bot=2, default=True),
      C("Add security", "spend('security', 10000 * scale)", "commission += 1", result="Calm, orderly, slightly less fun.")]),
], {"subject": F(OURS + " && f.booked"), "other": F(OURS + " && f.booked && f.gym != subject.gym && f.division == subject.division")}, cd=104)

# ---------------------------------------------------------------- the nutrition guru
CH('ch_guru', [
    ('gu_join', 'The Guru', [sc('social', "{subject.first} has a new 'performance guru' who believes in raw eggs, sunlight on the testicles, and sleeping upside down. {subject.last} says {he} 'has never felt better'. {He} looks yellow.")],
     [C("Allow it, it's {his} life", "follow('gu_crash', 5)", result="{He} starts posting sunrise videos. Shirtless. Pantless. The algorithm hides them.", bot=1, default=True),
      C("Ban the guru from camp", "subject.morale -= 6", "subject.loyalty -= 3", result="The guru calls you 'an enemy of the sun'.")]),
    ('gu_crash', 'Salmonella Week', [sc('narration', "{subject.first} has salmonella. The guru says it's 'detox'. The doctor says it's salmonella. {He} has a fight in three weeks.")],
     [C("Pull {him} and fire the guru", "injure(subject, 3, 'food poisoning')", "subject.morale += 2", result="The guru leaves on a skateboard. {He} recovers on toast.", default=True, ethics=1),
      C("Fight anyway", "subject.skills.cardio -= 4", "subject.damage += 2", result="{He} fights pale, and loses the third round to his own stomach.", bot=1)]),
], {"subject": F(OURS + " && (f.traits.has('Conspiracy Poster') || f.traits.has('Gym Rat'))")}, cd=104)

# ---------------------------------------------------------------- the belt chaser
CH('ch_belt_chaser', [
    ('bc_demand', 'Title Shot Or I Walk', [visit("{subject.first} {subject.last} slams a stack of printed rankings on your desk. 'Four in a row. I'm next. If I'm not next, I'm gone.'", "{subject.first} {subject.last}")],
     [C("Promise {him} the next shot", "subject.morale += 8", "setFlag('promised_' + subject.id, 1)", "follow('bc_check', 10)", result="{He} leaves calm. Calm-ish. {He} kicks a vending machine on the way out, but calmly.", default=True),
      C("Make {him} take one more fight", "subject.morale -= 6", "subject.beef += 10", "follow('bc_walk', 6)", result="'One more' is the most hated phrase in the sport. You just said it.", bot=1)]),
    ('bc_check', 'The Promise', [phone("{subject.first} calls: 'Ten weeks. You promised. I've been counting. My kid has been counting. My kid made a calendar.'", "{subject.first} {subject.last}")],
     [C("Deliver: book the title fight", "subject.morale += 10", "subject.loyalty += 10", "subject.hype += 8", result="{His} kid crosses off the last day on the calendar. Everyone is happy, except the champ.", default=True, ethics=1),
      C("Delay again", "subject.loyalty -= 15", "subject.beef += 15", "fighters -= 2", result="{He} posts the calendar. With a big red X. 4 million views.", bot=1, ethics=-1)]),
    ('bc_walk', 'The Walkout', [sc('headline', "{subject.last} REFUSES TO FIGHT UNTIL GIVEN TITLE SHOT; posts video training alone in a parking garage")],
     [C("Give in", "subject.morale += 6", "subject.beef -= 10", result="{He} wins the standoff. The rest of the roster takes notes.", default=True),
      C("Release {him}", "release(subject)", "fighters -= 3", "fans -= 2", result="{He} signs with a rival within the week. Of course.", bot=1)]),
], {"subject": F(OURS + " && f.streak >= 4 && !f.champ")}, cd=104)

# ---------------------------------------------------------------- the gambler
CH('ch_gambler', [
    ('gm_debt', 'The Marker', [phone("A polite man named Sal says {subject.first} owes 'some friends' a large amount from 'cards'. Sal wants you to know he's a big fan. Sal also knows where your car is parked.", "Sal")],
     [C("Pay the marker quietly ({$fee})", "spend('misc', vars.fee)", "subject.loyalty += 6", "follow('gm_again', 12)", result="Sal sends a fruit basket. The fruit basket is threatening somehow.", bot=1),
      C("Get {him} into a recovery program", "spend('wellness', vars.fee * 0.3)", "subject.addiction -= 10", "removeTrait(subject, 'Gambler')", result="{He} goes to meetings. {He} bets on how long the meetings last. Baby steps.", default=True, ethics=2),
      C("Not your problem", "subject.morale -= 10", "chance(0.4) ? injure(subject, 3, 'unexplained hand injury') : meter('fighters', -1)", result="Sal is disappointed. Sal's disappointment has consequences.", ethics=-1)]),
    ('gm_again', 'Sal Calls Again', [phone("Sal again. 'Your guy has a new marker. Bigger. I'm starting to feel like family. Do you feel like family?'", "Sal")],
     [C("Recovery program, mandatory this time", "subject.addiction -= 15", "removeTrait(subject, 'Gambler')", "subject.morale -= 4", result="This time it sticks. Mostly. {He} bets on football once. Only once.", default=True, ethics=2),
      C("Pay it again", "spend('misc', vars.fee * 1.5)", "heat += 2", result="Sal adds you to his Christmas card list.", bot=1, ethics=-2)]),
], {"subject": F(OURS + " && f.traits.has('Gambler') && !f.parody")}, cat='legal', vars={"fee": money(20, 60)}, cd=104, tags=['serious'])

# ---------------------------------------------------------------- the pay-per-view prophet
CH('ch_prediction', [
    ('pp_predict', 'The Prediction', [sc('social', "{subject.first} posts: 'I will KO {other.last} in the first round with a left hook. Screenshot this.' 2 million people screenshot it.")],
     [C("Hype it everywhere", "subject.hype += 8", "fans += 2", "follow('pp_result', 4)", result="Every commercial ends with 'SCREENSHOT THIS'.", bot=2, default=True),
      C("Tell {him} to tone it down", "subject.morale -= 3", "follow('pp_result', 4)", result="{He} posts 'toning it down' followed by 47 fire emojis.")]),
    ('pp_result', 'Screenshot This', [sc('headline', "{subject.last}'s 'SCREENSHOT THIS' prediction resurfaces before the fight. Bookmakers report record bets on a round-one KO. One man bet his boat.")],
     [C("Ride it", "earn('ppv', 50000 * scale)", "fans += 2", result="Whatever happens, the internet wins.", default=True)]),
], {"subject": F(OURS + " && f.booked && (f.traits.has('Trash Talker') || f.traits.has('Showman'))"), "other": F("f.booked && f.id != subject.id && f.division == subject.division")}, cd=52)
