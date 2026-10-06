from dsl import *

FILE = 'weird'
OURS = "f.ours"


def W(id, title, scenes, choices, who="true", cd=52, weight=8, cond=None, extra=None, tags=None, vars=None):
    roles = {"subject": F(OURS + " && " + who)}
    if extra:
        roles.update(extra)
    S(FILE, id, title, 'weird', scenes, choices, roles=roles, cd=cd, weight=weight, cond=cond, tags=tags, vars=vars)


W('weird_tiger', 'The Tiger', [sc('social', "{subject.first} {subject.last} bought a tiger. A real one. It lives in {his} condo. {He} named it 'Leg Kick'. The homeowners' association has called an emergency meeting. The tiger has 400,000 followers.")],
  [C("Make the tiger the promotion mascot", "fans += 3", "media -= 1", "commission -= 2", "subject.hype += 6", result="Leg Kick walks out with {subject.first} at the next event. The commission has a long and specific meeting about it.", bot=1),
   C("Make {him} give it to a sanctuary", "media += 2", "subject.morale -= 6", result="{He} visits every weekend. The tiger seems relieved.", default=True, ethics=1)],
  who="!f.parody && (f.traits.has('Showman') || f.traits.has('Party Animal'))")

W('weird_flat_earth', 'Flat Earther', [sc('social', "{subject.first} posted a 40-minute video titled 'THE CURVE IS A LIE' filmed on a beach. At minute 31 {he} throws a rock at the horizon 'to prove a point'. The point is unclear.")],
  [C("Book {him} on a card in 'the edge of the world' (Perth)", "fans += 2", "subject.hype += 4", result="{He} flies to Australia, looks out the window the whole flight, and says nothing.", bot=1),
   C("Ask {him} to tone it down", "subject.morale -= 2", result="{He} tones it down to 30-minute videos.", default=True)],
  who="f.traits.has('Conspiracy Poster')")

W('weird_mayor', 'Running For Mayor', [sc('social', "{subject.first} {subject.last} is running for mayor of {subject.hometown}. Campaign slogan: 'I'LL FIX THE POTHOLES WITH MY HANDS'. Polling at 23%. The incumbent is scared.")],
  [C("Endorse {him} publicly", "subject.hype += 8", "media -= 1", "fans += 2", result="{He} wins. The town now has the safest streets in the state and a cage in the town hall.", bot=1),
   C("Stay neutral", result="{He} loses by 40 votes and demands a recount 'like the judges should've done'.", default=True)],
  who="f.traits.has('Political') || f.traits.has('Showman')")

W('weird_mom_trash_talk', 'Mom Is Better At This', [sc('social', "{subject.first}'s mom went on a podcast and roasted {his} next opponent for 20 minutes. Nobody has ever been this thoroughly destroyed. The opponent's own mother called to apologize.")],
  [C("Give Mom a press-conference seat", "fans += 3", "subject.hype += 8", "media += 1", result="Mom steals the presser. She gets her own sponsor. It's a casserole brand.", bot=1),
   C("Let it go", "subject.hype += 3", result="Mom posts again. Unprompted.", default=True)], cd=60)

W('weird_crypto_coin', 'The Coin', [sc('social', "{subject.first} launched ${subject.last}COIN. It went up 4,000% in a day. It went down 99.8% in an hour. Thousands of fans lost money. {He} posted 'WAGMI' and then deleted {his} account.")],
  [C("Pay back the fans (partially)", "spend('refunds', 80000 * scale)", "media += 2", "fans += 1", "subject.moneyIQ -= 10", result="The fans get pennies on the dollar and a signed photo. Some are grateful. Most are not.", ethics=1),
   C("Distance the promotion", "media -= 1", "subject.morale -= 3", "news('crypto', -0.4, 5)", result="'{promotion} had no involvement.' Your logo was on the coin's website.", default=True),
   C("Let {him} rugpull in peace", "fans -= 4", "heat += 2", "chaos += 2", result="The SEC sends a letter. It does not say WAGMI.", bot=1, ethics=-2)],
  who="!f.parody && f.traits.has('Crypto Bro')", tags=['serious'])

W('weird_rap_album', 'The Rap Album', [sc('social', "{subject.first} released a 19-track rap album called 'TAPOUT SZN'. Track 7 is just {him} reading {his} record over a beat. Track 12 features {his} cutman. Critics give it a 1.2/10.")],
  [C("Play it at every event", "fans -= 1", "subject.morale += 8", "subject.followers *= 1.05", result="The crowd learns the words to Track 12. Nobody knows how.", bot=1),
   C("Politely never mention it", "subject.morale -= 2", result="{He} mentions it for you. Constantly.", default=True)],
  who="f.traits.has('Showman') || f.traits.has('Clout Chaser')")

W('weird_hot_sauce', 'Hot Sauce Empire', [sc('social', "{subject.first}'s hot sauce, 'THE KNOCKOUT', is so hot that a food critic passed out on camera. Sales are up 9,000%. A hospital is suing.")],
  [C("Make it the official sauce of the promotion", "earn('sponsors', 30000 * scale)", "subject.loyalty += 6", result="Every arena hot dog now comes with THE KNOCKOUT. Bathroom lines are a problem.", bot=1),
   C("Stay out of it", result="It's in every grocery store by spring.", default=True)],
  who="f.business.length > 0")

W('weird_onlyfans', 'The Subscription Site', [sc('social', "{subject.first} launched a page on OnlyFighters. Content: 'exclusive training footage', 'feet pics (for the leg-kick enthusiasts)', and 'personal messages'. {He} made more last month than {his} last three purses combined.")],
  [C("Congratulate {him} on diversifying", "subject.morale += 6", "sponsors -= 1", "media -= 1", result="{He} sends you a free subscription. You do not open it.", default=True),
   C("Ask for a revenue share", "earn('licensing', 20000 * scale)", "subject.loyalty -= 6", "fighters -= 1", result="{He} laughs for a full minute. Then sends you 5%.", bot=1)],
  who="!f.parody && (f.traits.has('Clout Chaser') || f.traits.has('Showman') || f.purse < 10000)")

W('weird_cult', 'The Gym Is A Cult', [doc("A former member of {subject.gym} says it's 'basically a cult'. Members wake at 4am, drink 'mushroom coffee', chant before sparring, and must address the head coach as 'Sensei Father'. {subject.first} trains there and loves it.", "TIP LINE")],
  [C("Investigate the gym", "media += 1", "subject.morale -= 4", result="It's not a cult. It's just very intense. The mushroom coffee, however, is extremely illegal in two states.", default=True),
   C("Ignore it. {He} wins fights.", "heat += 1", result="{He} wins {his} next fight and thanks 'Sensei Father' in the post-fight interview.", bot=1)],
  who="!f.parody && (f.traits.has('Paranoid') || f.traits.has('Gym Rat'))")

W('weird_alien', 'Abducted', [sc('social', "{subject.first} missed fight-week media day. {His} explanation, posted at 3am: 'I was abducted. They showed me things. I'm stronger now.' {He} has a new tattoo of a triangle.")],
  [C("Promote it: 'the man who fought aliens'", "subject.hype += 10", "fans += 2", "media -= 1", result="Alien-themed walkout. The crowd wears tinfoil hats. {He} wins in 30 seconds.", bot=1),
   C("Fine {him} for missing media day", "subject.morale -= 4", result="{He} pays the fine 'in their currency'. It's a rock.", default=True)],
  who="f.traits.has('Conspiracy Poster') || f.traits.has('Paranoid')", cd=104)

W('weird_reality_dating', 'Dating Show', [sc('social', "{subject.first} {subject.last} is a contestant on a dating show called 'Love In The Cage'. {He} has been eliminated in episode 2 for 'trying to wrestle the host'.")],
  [C("Book {him} on the next card as 'the most eligible fighter'", "subject.hype += 6", "fans += 2", result="{He} gets 4,000 marriage proposals in the comments. One is from the host.", bot=1),
   C("Let it pass", result="Episode 2 is the highest-rated episode of the season.", default=True)],
  who="!f.married && (f.traits.has('Showman') || f.traits.has('Clout Chaser'))")

W('weird_videogame', 'Esports Career', [sc('social', "{subject.first} went pro in a fighting video game. {He} is now ranked higher in the video game than in real life. {He} plays {him}self. {He} loses as {him}self.")],
  [C("Sponsor {his} esports team", "earn('sponsors', 10000 * scale)", "fans += 1", "subject.morale += 4", result="'{promotion} Esports' is born. It has one member. He is very good.", bot=1),
   C("Tell {him} to focus on real fights", "subject.morale -= 3", result="{He} rage-quits. On stream.", default=True)],
  who="f.streaming")

W('weird_pet_snake', 'Emotional Support Python', [sc('visit', "{subject.first} arrives at your office with a 12-foot python draped around {his} neck. 'This is Gerald. He's my emotional support python. He needs a credential for fight week.'", "{subject.first} {subject.last}")],
  [C("Give Gerald a credential", "fans += 2", "commission -= 1", result="Gerald attends the weigh-ins. He is the calmest person there.", bot=1),
   C("No snakes", "subject.morale -= 4", result="Gerald waits in the car. {He} visits him between rounds of interviews.", default=True)],
  who="f.traits.has('Paranoid') || f.traits.has('Diva')", cd=104)

W('weird_reality_star_ex', 'The Ex Is On TV', [sc('social', "{subject.first}'s ex is on a reality show talking about how {he} 'cried during The Notebook' and 'sleeps with a nightlight shaped like a belt'. The clip has 12 million views.")],
  [C("Lean in: a nightlight merch line", "earn('merch', 25000 * scale)", "subject.morale -= 5", "fans += 2", result="The belt-shaped nightlight sells out. {He} is furious and slightly proud.", bot=1),
   C("Say nothing", "subject.morale -= 2", result="{He} posts a picture of {him}self with the nightlight, owning it. Respect.", default=True)],
  who="f.star > 25")

W('weird_wrestling_crossover', 'Pro Wrestling Calls', [phone("Worldwide Wrestling Spectacle wants {subject.first} {subject.last} for a one-night appearance: {he} gets hit with a folding chair, then wins with a 'shoot' takedown. They'll pay {$fee} and promote your next PPV on their show.", "WWS talent relations")],
  [C("Approve it", "earn('licensing', vars.fee)", "fans += 3", "subject.hype += 8", "injure(subject, 2, 'folding chair')", result="The chair spot is perfect. {He} gets a catchphrase. Your PPV buys spike.", bot=2),
   C("No: fights are real", "fans += 1", result="WWS books a slap fighter instead.", default=True)],
  who="f.star > 40 && (f.traits.has('Showman') || f.traits.has('Trash Talker'))", cd=60, extra=None, vars={"fee": money(40, 120)})

W('weird_documentary', 'The Documentary', [phone("A streaming giant wants to film a documentary about {subject.first} {subject.last}. Total access. Locker room, family dinners, weight cut, the works. Working title: '{subject.last}: Bleed'.", "Megaflix producer")],
  [C("Full access", "subject.hype += 15", "fans += 4", "heat += 2", "chaos += 2", "earn('licensing', 100000 * scale)", result="The documentary is a hit. It also shows you yelling at a cutman for six minutes. You become a meme.", bot=2),
   C("Limited access", "subject.hype += 8", "fans += 2", "earn('licensing', 40000 * scale)", result="Nice footage. No scandals. Critics call it 'a commercial'.", default=True)],
  who="f.star > 45", cd=104)

W('weird_impostor', 'The Impostor', [sc('social', "A man has been posing as {subject.first} {subject.last} at bars across the state, getting free drinks and signing autographs. He looks nothing like {him}. He's 5'4\". He's been doing it for a year.")],
  [C("Hire the impostor as a body double for media days", "fans += 2", "subject.morale -= 2", result="Nobody notices the difference. Nobody.", bot=1),
   C("Cease and desist", result="The impostor retires. Several bars are devastated.", default=True)],
  who="f.followers > 100000", cd=104)

W('weird_cooking_show', 'Cooking Show', [sc('social', "{subject.first} launched a cooking show called 'Cutting Weight Cuisine'. Episode 1: a plain chicken breast, boiled for 40 minutes. 3 million views. People are calling it 'the saddest thing on the internet'.")],
  [C("Sponsor it", "earn('sponsors', 8000 * scale)", "subject.followers *= 1.05", result="Season 2 adds a single grain of salt.", bot=1),
   C("Ignore it", result="{He} adds broccoli. Ratings explode.", default=True)],
  who="f.skills.weightCut > 55")

W('weird_wedding_brawl', 'Wedding Brawl', [sc('social', "{subject.first} {subject.last}'s wedding ended in a brawl between {his} gym and {his} spouse's family. The cake was destroyed. The best man was submitted with a rear-naked choke. Footage is everywhere.")],
  [C("Send a new cake and congratulations", "media += 1", "subject.loyalty += 6", result="The new cake arrives. Nobody fights over it. Growth.", default=True),
   C("License the footage for a promo", "earn('licensing', 15000 * scale)", "subject.morale -= 4", "fans += 2", result="'LOVE IS A FIGHT.' The commercial wins an award. {His} spouse does not speak to you.", bot=1)],
  who="!f.parody && f.traits.has('Hothead')", cd=104)

W('weird_nft_belt', 'NFT Belt', [sc('social', "{subject.first} sold an NFT of {his} championship belt for {$fee}. The buyer thinks they own the actual belt. The buyer is outside your office with a lawyer.")],
  [C("Give the buyer a replica belt", "spend('settlements', 3000 * scale)", "media += 1", result="The buyer is thrilled. He wears it to his kid's graduation.", default=True),
   C("Tell the buyer to read the fine print", "media -= 1", "fans -= 1", result="The fine print says 'this is a jpeg'. The buyer cries.", bot=1)],
  who="f.champ && (f.traits.has('Crypto Bro') || f.traits.has('Business Savvy'))", cd=104, vars={"fee": money(50, 250)})

W('weird_ghost', 'Haunted Hotel', [sc('social', "{subject.first} refuses to stay in the fight-week hotel because it's 'haunted'. {He} has posted 14 videos of a door closing by itself. {He} is sleeping in {his} car in the parking garage.")],
  [C("Move {him} to another hotel", "spend('travel', 2000 * scale)", "subject.morale += 4", result="The new hotel is also haunted, according to {him}.", default=True),
   C("Hire a ghost hunter for content", "fans += 2", "subject.hype += 3", result="The ghost hunter finds nothing. The video does huge numbers anyway.", bot=1)],
  who="f.traits.has('Paranoid') || f.traits.has('Conspiracy Poster')", cd=104)

W('weird_child_star', 'Viral Kid Fan', [sc('social', "A seven-year-old fan did a perfect impression of {subject.first}'s walkout, trash talk and all, at a school talent show. 20 million views. {subject.first} is crying in the comments.")],
  [C("Fly the kid out for the next event", "spend('travel', 3000 * scale)", "fans += 4", "subject.morale += 8", "media += 2", result="The kid walks out with {subject.first}. The whole arena chants the kid's name.", ethics=1, default=True),
   C("Send merch", "fans += 1", result="The kid wears it to school every day.")],
  who="f.star > 25 && (f.traits.has('Wholesome') || f.traits.has('Showman'))", cd=60)

W('weird_wrong_country_flag', 'Wrong Flag', [sc('fightnight', "During {subject.first} {subject.last}'s walkout, the big screen showed the flag of the wrong country. {He} is from {subject.country}. The flag was from a country that doesn't exist anymore.")],
  [C("Apologize to {subject.country}", "media += 1", "subject.morale += 2", result="A sincere apology. A small diplomatic incident avoided.", default=True),
   C("Blame the intern", "media -= 1", "fighters -= 1", result="The intern is also from {subject.country}. Awkward.")],
  who="f.country != 'USA'", cd=60)

W('weird_mascot', 'Mascot Brawl', [sc('social', "Your promotion's new mascot, 'Knucklehead', got into a fight with a minor-league baseball mascot during a charity event. The baseball mascot lost. Badly. Knucklehead was, it turns out, {subject.first} {subject.last} in costume.")],
  [C("Give Knucklehead a fight-night bonus", "fans += 3", "media -= 1", "subject.hype += 4", result="Knucklehead becomes a cult figure.", bot=1),
   C("Retire Knucklehead", "media += 1", result="Knucklehead's last appearance is a tearful goodbye. Children weep.", default=True)],
  who="f.traits.has('Prankster')", cd=104)

W('weird_twin', 'The Secret Twin', [sc('social', "Footage appears to show {subject.first} {subject.last} at a club in Miami at the exact time {he} was weighing in in Vegas. {He} claims {he} has 'a twin'. Nobody has ever heard of the twin.")],
  [C("Sign the twin", "fans += 2", "chaos += 1", result="The twin exists. He's a dentist. He's 0-1 now.", bot=1),
   C("Don't ask", result="Nobody asks. The mystery deepens.", default=True)],
  who="f.traits.has('Prankster') || f.traits.has('Party Animal')", cd=104)

W('weird_soundcloud_walkout', 'The Walkout Song', [phone("{subject.first} wants to walk out to a song {he} recorded {him}self called 'I'm Literally Him'. The licensing team says it's the only song in history that legal can't figure out how to license because it's 'too stupid'.", "Your music licensing team")],
  [C("Approve it", "subject.morale += 6", "fans += 1", result="The crowd sings it. Ironically, then sincerely.", bot=1),
   C("Make {him} use classic rock", "subject.morale -= 3", result="{He} walks out to classic rock, mouthing the words to {his} own song.", default=True)],
  who="f.traits.has('Showman') || f.traits.has('Clout Chaser')", cd=60)

W('weird_glazing', 'The Glazing Incident', [sc('social', "{subject.first} posted a 1,400-word tribute to {other.first} {other.last}, calling {other.last} 'the greatest martial artist since the dinosaurs'. Fans are calling it 'the most aggressive glazing in history'. {other.last} has blocked {him}.")],
  [C("Book them as teammates in a tag-team exhibition", "fans += 2", "subject.hype += 3", "other.hype += 3", result="It's a disaster. They both love it.", bot=1),
   C("Ignore it", result="The glazing continues. Daily.", default=True)],
  extra={"other": F("f.ours && f.id != subject.id && f.star > subject.star")})
