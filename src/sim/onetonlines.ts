/**
 * 1ton's conversations, written as conversations: every question comes with its own answers
 * (the button you press, what you say, how he takes it), so the reply always fits the question.
 *
 *  - PRESSER: the promoter's press conference (Career mode). Placeholders: {f} the fighter he's
 *    asking about, {opp} his opponent, {presidentLast}, {promotion}, {where}, {n} (broken promises).
 *  - SCRUM: your post-fight scrum (Road To Champion / Legacy). Placeholders: {you}, {opp}.
 */
export type OnetonAnswer = 'promise' | 'deflect' | 'joke' | 'honest' | 'roast';
export type OnetonKind = 'ask_card' | 'ask_roster' | 'ask_none' | 'ask_other' | 'ask_broken';

export interface Reply { label: string; said: string; react: string }
export interface Convo { q: string; a: Record<OnetonAnswer, Reply> }

export const PRESSER: Record<OnetonKind, Convo[]> = {
  // a Mexican fighter is on tonight's card
  ask_card: [
    {
      q: '1ton, the Lucha Lowdown. {presidentLast}: when does {f} headline? Mexico has been watching and Mexico is ready to riot. Politely.',
      a: {
        promise: { label: 'PROMISE HIM A MAIN EVENT', said: 'Win tonight and {f} headlines the next big card. You have my word.', react: '1ton writes "MAIN EVENT" in his notebook, underlines it three times and holds it up to the camera.' },
        honest: { label: 'TELL HIM THE TRUTH', said: "Honestly? {f} needs two more wins before he's main-event ready. Tonight's one of them.", react: '1ton thinks about it. "Two wins. I can count to two. I will be counting."' },
        deflect: { label: 'DEFLECT', said: "Let's get through tonight first, 1ton.", react: '"Tonight is the appetiser," says 1ton. "I asked about the main course."' },
        joke: { label: 'MAKE A JOKE', said: "He'll headline when you stop asking. So never.", react: '1ton nods, very seriously. "Then he headlines never. Unacceptable. I will keep asking forever."' },
        roast: { label: 'ROAST HIM', said: "1ton, if {f} headlines, will you finally go home?", react: '"I will go home," says 1ton, "when {f} goes HOME. As champion. To Mexico." The room claps for him, not you.' },
      },
    },
    {
      q: '1ton here. {presidentLast}, I did the maths. {f} should be the main event tonight, not where you put him. Explain the maths.',
      a: {
        promise: { label: 'PROMISE HE MOVES UP', said: 'You\'re right. Next card, {f} moves up the bill. Main card, minimum.', react: '"Minimum," 1ton repeats, writing it down. "I will remember the word minimum."' },
        honest: { label: 'EXPLAIN THE MATHS', said: 'The maths is ticket sales, 1ton. The main event sells more right now. That changes when {f} wins.', react: '1ton blinks. "That\'s actual maths." He seems shaken. "Okay. Then make him win."' },
        deflect: { label: 'DEFLECT', said: 'The card is what the card is.', react: '"The card is wrong," says 1ton, to nobody and everybody.' },
        joke: { label: 'MAKE A JOKE', said: 'I failed maths, 1ton. That\'s why I\'m a promoter.', react: 'Big laugh. 1ton doesn\'t laugh. "That explains the card," he says.' },
        roast: { label: 'ROAST HIM', said: 'You did maths? With what, your beard?', react: '1ton strokes the beard. "My beard has a degree," he says. It\'s somehow the better line.' },
      },
    },
    {
      q: '1ton. Question about {f} against {opp}: is {opp} aware of Mexican cardio? Has anybody warned him? Should somebody call his family?',
      a: {
        promise: { label: 'HYPE THE FIGHT', said: '{opp} knows. Everybody knows. This one is going all three rounds of war, I promise you.', react: '1ton stands and applauds. "Three rounds of war. I will hold you to every round."' },
        honest: { label: 'GIVE A REAL ANSWER', said: "{opp}'s camp has been doing extra rounds. They know {f} will push the pace.", react: '"Extra rounds won\'t help," says 1ton, satisfied. "But I respect the effort."' },
        deflect: { label: 'DEFLECT', said: 'Ask {opp} that. I just book the fights.', react: '1ton turns in his seat and points at {opp} at the end of the table. {opp} pretends to read a water bottle.' },
        joke: { label: 'MAKE A JOKE', said: "We've told his family. They've booked a priest.", react: '1ton laughs so hard he has to put his hand down. For the first time all night, it\'s down.' },
        roast: { label: 'ROAST HIM', said: 'Is your cardio Mexican, 1ton? You get winded asking questions.', react: '"I asked forty questions last presser," says 1ton. "I was not winded. Check the tape."' },
      },
    },
    {
      q: '1ton, Lucha Lowdown. If {f} wins tonight, does he get a title shot? Yes or no. Mexico is listening on speakerphone.',
      a: {
        promise: { label: 'SAY YES', said: 'If {f} wins impressively tonight, he\'s in the title conversation. Yes.', react: '1ton holds his phone up. Somebody on the other end screams "SÍ". It might be his mother.' },
        honest: { label: 'SAY "NOT YET"', said: 'Not yet. He needs a ranked win first. Tonight could set that up.', react: '"Not yet is not no," says 1ton into his phone. The phone cheers anyway.' },
        deflect: { label: 'DEFLECT', said: "Let's see how the fight goes.", react: '1ton relays it into the phone: "He said maybe." Distant booing.' },
        joke: { label: 'MAKE A JOKE', said: 'Tell Mexico I said hola.', react: '"Mexico says hola," 1ton reports. "Mexico also says answer the question."' },
        roast: { label: 'ROAST HIM', said: 'Hang up the phone, 1ton. This isn\'t a call-in show.', react: '1ton puts the phone on speaker and turns it to face you. You are now on a call-in show.' },
      },
    },
  ],
  // a Mexican fighter is on your roster but not on this card
  ask_roster: [
    {
      q: '1ton. Where is {f}? Why is {f} not on this card? I flew here. I paid for parking. I\'m asking about {f}.',
      a: {
        promise: { label: 'PROMISE HIM THE NEXT CARD', said: '{f} is on the next card. I\'ll make the call tonight.', react: '"Tonight," says 1ton. "I will be in the lobby. I will hear the phone ring."' },
        honest: { label: 'TELL HIM THE TRUTH', said: "We couldn't find {f} the right opponent for this one. Nobody wanted it, honestly.", react: '1ton nods, proud. "Nobody wanted it. Of course they didn\'t."' },
        deflect: { label: 'DEFLECT', said: "{f} is resting. Next question.", react: '"Resting from what?" says 1ton. "He hasn\'t fought in months. He is RESTED."' },
        joke: { label: 'MAKE A JOKE', said: 'We\'ll pay your parking, 1ton.', react: '1ton slides a parking stub down the press table. It\'s $38. You pay it. It\'s on camera.' },
        roast: { label: 'ROAST HIM', said: 'Maybe {f} is avoiding you, 1ton.', react: '"He would never," says 1ton, wounded. Then he checks his phone. Then he looks less sure.' },
      },
    },
    {
      q: '1ton, the Lucha Lowdown. Is {f} injured? Because if {f} isn\'t injured, I don\'t understand why I\'m watching a card without {f} on it.',
      a: {
        promise: { label: 'PROMISE HE FIGHTS SOON', said: '{f} is healthy and he fights within the next two cards. Guaranteed.', react: '1ton starts a countdown on his phone and shows it to the room.' },
        honest: { label: 'TELL HIM THE TRUTH', said: "He's not injured. We're negotiating his contract. It's slow.", react: '"Pay the man," says 1ton. Three reporters nod. One of them is from a business paper.' },
        deflect: { label: 'DEFLECT', said: "We don't discuss medicals, 1ton.", react: '"I\'m not asking about medicals," says 1ton. "I\'m asking about MEXICO."' },
        joke: { label: 'MAKE A JOKE', said: "He's injured. His heart. From reading your bleets.", react: '1ton puts a hand over his own heart. "Then we are both injured," he says, beautifully.' },
        roast: { label: 'ROAST HIM', said: "The only thing injured here is my patience.", react: '1ton raises his hand again, very slowly, to make sure the injury gets worse.' },
      },
    },
    {
      q: 'Hi, 1ton. Great event. Anyway. {f}. When? Where? Against who? Can it be a five-rounder?',
      a: {
        promise: { label: 'BOOK IT RIGHT THERE', said: 'Next month. Main card. Five rounds if it\'s a title eliminator. Happy?', react: '"When, where, who, how long," says 1ton, ticking boxes. "Three out of four. Good night for Mexico."' },
        honest: { label: 'TELL HIM THE TRUTH', said: "When: soon. Where: wherever the venue's cheapest. Against who: whoever says yes.", react: '1ton writes down "whoever says yes" and circles it, deeply suspicious.' },
        deflect: { label: 'DEFLECT', said: 'One question at a time, 1ton.', react: '"Then: when?" says 1ton. Then: "Where?" Then: "Against who?" He is doing it one at a time.' },
        joke: { label: 'MAKE A JOKE', said: 'Tuesday, in your garage, against you. Five rounds.', react: '"I accept," says 1ton, immediately. You realise you have created a problem.' },
        roast: { label: 'ROAST HIM', said: "You said 'anyway' like we were done. We were done.", react: '"We are never done," says 1ton. It sounds like a threat. It is a threat.' },
      },
    },
  ],
  // no Mexican fighters anywhere near this promotion
  ask_none: [
    {
      q: '1ton. I counted the card twice. Zero Mexican fighters. Zero. Do you hate tacos, {presidentLast}? Do you hate joy?',
      a: {
        promise: { label: 'PROMISE TO SIGN ONE', said: 'I love tacos. I\'ll sign a Mexican fighter before the next card.', react: '1ton stands. "I have three names in my car." He goes to get them. He comes back with four.' },
        honest: { label: 'TELL HIM THE TRUTH', said: "We don't have one. That's on me. We're scouting.", react: '1ton blinks. Nobody has ever answered him honestly. He doesn\'t know what to do with his hand.' },
        deflect: { label: 'DEFLECT', said: 'This card is stacked, 1ton. Enjoy it.', react: '"Stacked like a taco with no filling," says 1ton. "Just shell."' },
        joke: { label: 'MAKE A JOKE', said: 'I love tacos. I am at war with joy.', react: '1ton considers it. "That I believe," he says, and writes it down.' },
        roast: { label: 'ROAST HIM', said: 'Count it a third time. Maybe one shows up.', react: 'He counts it a third time, out loud, slowly, while the room waits. Zero. "Zero," he announces.' },
      },
    },
    {
      q: 'Question from 1ton: is {promotion} aware Mexico exists? It\'s right there. Under Texas. You can drive to it.',
      a: {
        promise: { label: 'PROMISE A MEXICO CARD', said: "We're aware. We're looking at a Mexico City show next year.", react: '1ton books a flight on his phone, right there, for a show that doesn\'t exist yet.' },
        honest: { label: 'TELL HIM THE TRUTH', said: "We're aware. We just can't afford the fighters there yet.", react: '"Money," says 1ton sadly. "Always money. Never Mexico."' },
        deflect: { label: 'DEFLECT', said: 'We are aware of many countries.', react: '"Name three," says 1ton. You name three. None of them is Mexico. It\'s a disaster.' },
        joke: { label: 'MAKE A JOKE', said: "I've driven to it. I got lost in Texas for six hours.", react: '"Everybody does," says 1ton, softening. "Texas is very big. Mexico is bigger. In the heart."' },
        roast: { label: 'ROAST HIM', said: "Is 1ton aware other questions exist?", react: '"I am aware," says 1ton. "I choose this one. Every time. Forever."' },
      },
    },
    {
      q: '1ton. {presidentLast}, I\'ll make this simple. One Mexican fighter. One. I\'ll even find him for you. He\'s in my car right now.',
      a: {
        promise: { label: 'SAY YOU\'LL MEET HIM', said: "Bring him to the office Monday. I'll look at him.", react: '"He\'ll be there Sunday night," says 1ton. "He\'ll wait."' },
        honest: { label: 'TELL HIM THE TRUTH', said: "I can't sign a guy out of your car, 1ton. Send me his tape.", react: '"His tape is also in the car," says 1ton. Fair point.' },
        deflect: { label: 'DEFLECT', said: 'Please do not leave people in cars, 1ton.', react: '"The windows are down," says 1ton. "He\'s fine. He\'s training."' },
        joke: { label: 'MAKE A JOKE', said: "Is he the guy who's been honking for an hour?", react: '"That\'s him," says 1ton, proudly. "Mexican cardio. He can honk for days."' },
        roast: { label: 'ROAST HIM', said: "The only thing in your car is your other notebook.", react: '1ton holds up the other notebook. It\'s full. Every page says "MEXICO".' },
      },
    },
  ],
  // a Mexican fighter elsewhere: sign him
  ask_other: [
    {
      q: '1ton. Have you heard of {f}? {where}. Undefeated in my heart. Sign him. I\'ll carry his bags.',
      a: {
        promise: { label: "SAY YOU'LL SIGN HIM", said: "I've heard of {f}. We're making an offer this week.", react: '1ton starts a slow clap. It doesn\'t catch on, but he keeps going for a long time.' },
        honest: { label: 'TELL HIM THE TRUTH', said: "I've seen {f}. He's good. I can't afford him right now.", react: '"Then I will start a fundraiser," says 1ton. He does. It raises $41.' },
        deflect: { label: 'DEFLECT', said: "I don't talk about other people's fighters.", react: '"He\'s not their fighter," says 1ton. "He\'s Mexico\'s fighter. On loan."' },
        joke: { label: 'MAKE A JOKE', said: "Undefeated in your heart isn't a record I can sell.", react: '"It\'s the best record," says 1ton. "Ask anyone in my heart."' },
        roast: { label: 'ROAST HIM', said: 'Carry his bags? You can barely carry that beard.', react: '"The beard carries ME," says 1ton, with total confidence.' },
      },
    },
    {
      q: '1ton here. There\'s a kid named {f}, {where}, and he\'s better than half your roster. I\'m not saying which half. I\'m saying it with my eyes.',
      a: {
        promise: { label: "SAY YOU'LL SIGN HIM", said: "Send me his contract status. If he's free, he's ours.", react: '"He\'s free," says 1ton instantly. He has been waiting years for that exact sentence.' },
        honest: { label: 'TELL HIM THE TRUTH', said: "Better than half? Maybe. Better than my main eventers? Not yet.", react: '1ton squints at your main eventers. "We\'ll see," he says, with his eyes.' },
        deflect: { label: 'DEFLECT', said: 'Our roster is very happy, 1ton.', react: 'Half your roster looks at the floor. 1ton looks at that half.' },
        joke: { label: 'MAKE A JOKE', said: "Which half? Blink once for the bottom half.", react: '1ton blinks once. Then twice. Then he won\'t stop blinking. Nobody knows what it means.' },
        roast: { label: 'ROAST HIM', said: "You say that about every kid with a pulse and a Mexican flag.", react: '"Yes," says 1ton. "And I\'m usually right."' },
      },
    },
  ],
  // he's counting your broken promises
  ask_broken: [
    {
      q: '1ton. {presidentLast}. You promised me a Mexican main event {n} times. I wrote them all down. I have them laminated. Where is it?',
      a: {
        promise: { label: 'PROMISE AGAIN', said: 'This time I mean it. Next card.', react: '"That makes {n}," says 1ton, adding a tally mark to the lamination with a dry-erase pen.' },
        honest: { label: 'ADMIT IT', said: "You're right. I kept saying it and didn't do it. I'm sorry.", react: 'The room goes quiet. 1ton puts the laminated sheet away. "Thank you," he says. "Now do it."' },
        deflect: { label: 'DEFLECT', said: "These things take time, 1ton.", react: '"{n} pressers is a lot of time," says 1ton, holding the lamination higher.' },
        joke: { label: 'MAKE A JOKE', said: 'Can I see the lamination? I want one for my fridge.', react: '1ton hands you a copy. He made spares. Of course he made spares.' },
        roast: { label: 'ROAST HIM', said: 'Laminate this: next question.', react: '"I will," says 1ton. He does. He brings it to the next presser.' },
      },
    },
    {
      q: '1ton here. Last time you said "soon". The time before that, "soon". {n} promises. Soon is not a date.',
      a: {
        promise: { label: 'GIVE HIM A DATE', said: 'Fine: the next PPV. That\'s a date.', react: '1ton circles a date on a calendar he brought for exactly this. "Witnessed," says the reporter next to him.' },
        honest: { label: 'ADMIT IT', said: "I don't have a date. I shouldn't have said soon.", react: '"Honesty," says 1ton. "Now I\'m confused. And grateful. Mostly confused."' },
        deflect: { label: 'DEFLECT', said: 'Soon is soon.', react: '1ton writes "SOON IS SOON" on a card and pins it to his own shirt.' },
        joke: { label: 'MAKE A JOKE', said: 'Soon is a date. It\'s in the Mexican calendar.', react: '"It is not," says 1ton, the only person in the room who checked.' },
        roast: { label: 'ROAST HIM', said: 'You know what else is soon? Security.', react: 'Security comes. 1ton keeps his hand up the whole way out, then comes back in through a different door.' },
      },
    },
  ],
};

export interface ScrumChoice { id: string; label: string; out: string; hype: number; morale?: number; bleet?: string }
export interface ScrumConvo { q: string; mex: boolean; when: 'win' | 'loss' | 'any'; choices: ScrumChoice[] }

/** 1ton at your post-fight scrum. Every question has answers that actually answer it. */
export const SCRUM: ScrumConvo[] = [
  // you're Mexican
  {
    mex: true, when: 'win', q: '1ton, Lucha Lowdown! {you}, Mexico is SCREAMING right now. Who do you dedicate this win to?',
    choices: [
      { id: 'viva', label: '"To Mexico. VIVA MEXICO!"', out: '"VIVA MEXICO!" 1ton stands on his chair. Security lets him. Nobody can stop it.', hype: 8, bleet: '{YOU} SAID VIVA MEXICO AT THE PRESSER. I AM ON THE FLOOR. SOMEONE CALL MY MOTHER.' },
      { id: 'family', label: '"My family. They sacrificed everything."', out: '1ton nods, deeply moved. "Family. Mexican. Perfect." He writes "PERFECT" in his notebook.', hype: 3, morale: 3 },
      { id: 'joke', label: '"To you, 1ton. Mostly your beard."', out: '1ton strokes the beard, honoured. "The beard accepts."', hype: 2 },
    ],
  },
  {
    mex: true, when: 'win', q: '1ton. {you}. I have cried four times tonight. When do you headline in Mexico City?',
    choices: [
      { id: 'soon', label: '"Next year. Tell them to save me a seat."', out: '1ton books a flight on his phone, right there in the scrum.', hype: 6, bleet: '{YOU} SAID MEXICO CITY NEXT YEAR. IT IS DECIDED. I HAVE BOOKED MY FLIGHT.' },
      { id: 'humble', label: '"When I earn it. A few more wins."', out: '"Humble," says 1ton, wiping his eyes. "That\'s five times now."', hype: 3, morale: 3 },
      { id: 'joke', label: '"Ask the promoter. He has the money."', out: '1ton turns and runs towards the promoter\'s office. Nobody sees him again tonight.', hype: 2 },
    ],
  },
  {
    mex: true, when: 'any', q: '1ton here! {you}, my mother wants to adopt you. She\'s serious. She made tamales. Answer carefully.',
    choices: [
      { id: 'yes', label: '"Tell her yes. I\'m coming for the tamales."', out: '1ton calls his mother on speaker. She screams. You have a new mother. The tamales are excellent.', hype: 5, morale: 4, bleet: 'MY MOTHER HAS ADOPTED {YOU}. THIS IS NOT A JOKE. SHE HAS MADE A ROOM.' },
      { id: 'polite', label: '"I have a mom. But I\'ll take the tamales."', out: '"She understands," says 1ton. "She is sending the tamales anyway. She is sending a lot of tamales."', hype: 2, morale: 3 },
      { id: 'joke', label: '"Only if you\'re my brother. No."', out: '1ton thinks about it, then hugs you. You did not agree to this. It\'s happening.', hype: 3 },
    ],
  },
  {
    mex: true, when: 'loss', q: '1ton. {you}. That hurt to watch. Mexico still loves you. Do you still love Mexico?',
    choices: [
      { id: 'love', label: '"More than ever. I\'ll be back."', out: '1ton holds up his notebook: "HE\'LL BE BACK". The room claps. Even after a loss.', hype: 4, morale: 5 },
      { id: 'sorry', label: '"I\'m sorry I let them down."', out: '"You let nobody down," says 1ton, fiercely. "You let the JUDGES down." He bleets about the judges for an hour.', hype: 2, morale: 6, bleet: 'THE JUDGES TONIGHT SHOULD BE INVESTIGATED. {YOU} DID NOTHING WRONG. (HE DID SOME THINGS WRONG.)' },
      { id: 'joke', label: '"Mexico can love me tomorrow. Tonight I need ice."', out: '1ton personally fetches you a bag of ice. Then a second bag. Then a cooler.', hype: 2, morale: 2 },
    ],
  },
  // you're not
  {
    mex: false, when: 'any', q: '1ton. {you}, quick question: do you have any Mexican blood? A grandma? An uncle? Anything?',
    choices: [
      { id: 'abuela', label: 'Claim a Mexican grandma', out: '', hype: 4 },
      { id: 'no', label: '"No. Sorry, man."', out: '1ton lowers his hand, slowly, and writes your name on a list. It\'s not a good list.', hype: -1, bleet: 'asked {you} one simple question. got "no". respectfully: boring.' },
      { id: 'joke', label: '"I had a burrito once. Does that count?"', out: '"It does not count," says 1ton. "But it\'s a start. Where was the burrito from?" It was a gas station. He leaves.', hype: 1 },
    ],
  },
  {
    mex: false, when: 'any', q: '1ton, Lucha Lowdown. {you}, what\'s your favourite taco? This matters. People are listening.',
    choices: [
      { id: 'pastor', label: '"Al pastor. Obviously."', out: '1ton nods. "Acceptable." From 1ton, that\'s a standing ovation.', hype: 3, bleet: '{YOU} SAID AL PASTOR. HONORARY MEXICAN STATUS: PENDING.' },
      { id: 'fish', label: '"Fish tacos."', out: '1ton stares for a long time. "That\'s a Baja answer. I\'ll allow it."', hype: 2 },
      { id: 'bell', label: '"Taco Bell."', out: 'The room goes silent. 1ton closes his notebook and leaves. Someone boos. It might be you.', hype: -2, bleet: '{YOU} said "taco bell" at a press scrum. i have nothing further.' },
    ],
  },
  {
    mex: false, when: 'win', q: '1ton here. {you}, would you fight a Mexican fighter next? Because I have a list. It\'s long. It\'s laminated.',
    choices: [
      { id: 'yes', label: '"Bring me the list. I\'ll fight anyone."', out: '1ton hands you the laminated list. It\'s 31 names long. He has circled four of them in red.', hype: 5, bleet: '{YOU} ASKED FOR THE LIST. I GAVE HIM THE LIST. HE IS BRAVE. HE IS ALSO IN TROUBLE.' },
      { id: 'respect', label: '"Respect to all of them. I go where I\'m booked."', out: '"Diplomatic," says 1ton, disappointed but impressed. "Like a Mexican ambassador."', hype: 2, morale: 2 },
      { id: 'joke', label: '"Is your name on the list?"', out: '1ton checks the list. Then he quietly adds his own name at the bottom.', hype: 2 },
    ],
  },
  {
    mex: false, when: 'loss', q: '1ton. {you}, tough night. Honestly? You know who wouldn\'t have lost that? A Mexican fighter. Thoughts?',
    choices: [
      { id: 'agree', label: '"You might be right. I\'ve got work to do."', out: '1ton softens. "Humble in defeat. You\'re learning. Come to Guadalajara. Train with real cardio."', hype: 2, morale: 3 },
      { id: 'fire', label: '"I\'ll fight any Mexican you name. Healthy."', out: '1ton\'s eyes light up. He bleets the challenge before you finish the sentence.', hype: 5, bleet: '{YOU} WANTS A MEXICAN FIGHTER WHEN HE\'S HEALTHY. I HAVE A LIST. THE LIST IS READY.' },
      { id: 'joke', label: '"A Mexican fighter wouldn\'t have had to fight him."', out: '"True," says 1ton. "Because a Mexican fighter would have been the main event." He walks off, undefeated.', hype: 1 },
    ],
  },
];
