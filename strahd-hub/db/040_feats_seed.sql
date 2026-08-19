-- db/040_feats_seed.sql
--
-- The shared feats catalogue: the 42 feats of the 2014 Player's Handbook, the
-- same book 024 took the expanded spell list from and the edition Curse of
-- Strahd was written for.
--
-- campaign_id is omitted on every row so it defaults to null -- the shared
-- catalogue every campaign reads. 039's INSERT policy forbids a client from
-- ever writing one of these; this file can because a migration runs as the
-- table owner, outside RLS.
--
-- Descriptions are summaries rather than the book's own wording: the lead
-- paragraph says what the feat is for, and `benefits` carries the mechanics as
-- the bullets they print as. Ability score increases granted by the half-feats
-- are stated in their own bullet rather than given a column -- there is nothing
-- in this app that could add +1 to a score it does not store.
--
-- `prerequisite` is the book's, and enforced by nobody: see 039's header.
-- Eleven of the forty-two have one. Note that Dual Wielder, Lightly Armored,
-- Martial Adept, Mounted Combatant, Magic Initiate and Weapon Master do NOT --
-- they are easy to assume into the list and are not in it.
--
-- `repeatable` is set on the two feats whose text says you may take them more
-- than once. 041's unique constraint still caps them at one per sheet; the flag
-- is there so the card can say so.
--
-- Categories are ours -- the PHB does not group feats -- and are checked by
-- 039. Counts, which BLOCK 0 below asserts:
--
--   combat 15, defense 7, general 3, magic 6, skill 9, social 2  =  42
--
-- RUN THE MIGRATION BLOCK BELOW ON ITS OWN. Per 036 the ledger insert is
-- unguarded, so a second run fails on the primary key and rolls back.


-- ===========================================================================
-- MIGRATION
-- ===========================================================================
--
-- CORRECT OUTPUT: "Success. No rows returned."

begin;

insert into feats (name, category, prerequisite, description, benefits, repeatable, tags) values

-- ---------------------------------------------------------------------------
-- combat
-- ---------------------------------------------------------------------------

($$Charger$$, $$combat$$, null,
 $$You turn a headlong rush into an opening, closing the distance and hitting on the same breath.$$,
 array[
   $$When you take the Dash action, you can use a bonus action to make one melee weapon attack or to shove a creature.$$,
   $$If you move at least 10 feet in a straight line immediately before taking this bonus action, you either gain a +5 bonus to the attack's damage roll or push the target up to 10 feet away.$$
 ], false, array[$$melee$$, $$movement$$]),

($$Crossbow Expert$$, $$combat$$, null,
 $$Long practice with the crossbow lets you reload without breaking rhythm and shoot in a press.$$,
 array[
   $$You ignore the loading quality of any crossbow you are proficient with.$$,
   $$Being within 5 feet of a hostile creature doesn't impose disadvantage on your ranged attack rolls.$$,
   $$When you use the Attack action with a one-handed weapon, you can use a bonus action to attack with a hand crossbow you are holding.$$
 ], false, array[$$ranged$$]),

($$Defensive Duelist$$, $$combat$$, $$Dexterity 13 or higher$$,
 $$You have trained to parry with a light blade, turning a hit aside at the last moment.$$,
 array[
   $$When you are wielding a finesse weapon you are proficient with and another creature hits you with a melee attack, you can use your reaction to add your proficiency bonus to your AC for that attack, possibly causing it to miss.$$
 ], false, array[$$defense$$, $$reaction$$]),

($$Dual Wielder$$, $$combat$$, null,
 $$You fight with a weapon in each hand as easily as most fight with one.$$,
 array[
   $$You gain a +1 bonus to AC while you are wielding a separate melee weapon in each hand.$$,
   $$You can use two-weapon fighting even when the one-handed melee weapons you are wielding aren't light.$$,
   $$You can draw or stow two one-handed weapons when you would normally draw or stow only one.$$
 ], false, array[$$melee$$]),

($$Grappler$$, $$combat$$, $$Strength 13 or higher$$,
 $$You have practised holds that let you close in and stay there.$$,
 array[
   $$You have advantage on attack rolls against a creature you are grappling.$$,
   $$You can use your action to try to pin a creature grappled by you; on a success, you and the creature are both restrained until the grapple ends.$$
 ], false, array[$$melee$$, $$grappling$$]),

($$Great Weapon Master$$, $$combat$$, null,
 $$You put the whole weight of a heavy weapon behind every swing.$$,
 array[
   $$On your turn, when you score a critical hit with a melee weapon or reduce a creature to 0 hit points with one, you can make one melee weapon attack as a bonus action.$$,
   $$Before you make a melee attack with a heavy weapon you are proficient with, you can choose to take a -5 penalty to the attack roll; if it hits, you add +10 to the attack's damage.$$
 ], false, array[$$melee$$, $$heavy$$]),

($$Martial Adept$$, $$combat$$, null,
 $$You have studied a battlefield tradition and carry a trick or two out of it.$$,
 array[
   $$You learn two manoeuvres of your choice from those available to the Battle Master archetype, using Strength or Dexterity as the saving throw ability.$$,
   $$You gain one superiority die (a d6), which is expended when you use it and regained on a short or long rest.$$
 ], false, array[$$manoeuvres$$]),

($$Mounted Combatant$$, $$combat$$, null,
 $$You are a dangerous foe to face while mounted, and a careful guardian of the beast beneath you.$$,
 array[
   $$You have advantage on melee attack rolls against any unmounted creature smaller than your mount.$$,
   $$You can force an attack aimed at your mount to target you instead.$$,
   $$If your mount is subjected to an effect that allows a Dexterity save for half damage, it instead takes no damage on a success and half on a failure.$$
 ], false, array[$$mounted$$]),

($$Polearm Master$$, $$combat$$, null,
 $$A glaive, halberd, quarterstaff or spear becomes an extension of your reach and your timing.$$,
 array[
   $$When you take the Attack action with a glaive, halberd, quarterstaff or spear, you can use a bonus action to make a melee attack with the opposite end, dealing d4 bludgeoning damage.$$,
   $$While you are wielding one of those weapons, other creatures provoke an opportunity attack from you when they enter your reach.$$
 ], false, array[$$melee$$, $$reach$$]),

($$Savage Attacker$$, $$combat$$, null,
 $$Your blows land with a viciousness that turns a graze into a wound.$$,
 array[
   $$Once per turn when you roll damage for a melee weapon attack, you can reroll the weapon's damage dice and use either total.$$
 ], false, array[$$melee$$, $$damage$$]),

($$Sentinel$$, $$combat$$, null,
 $$You hold a line, and anything that tries to walk past you regrets it.$$,
 array[
   $$When you hit a creature with an opportunity attack, its speed becomes 0 for the rest of the turn.$$,
   $$Creatures provoke opportunity attacks from you even if they take the Disengage action.$$,
   $$When a creature within 5 feet of you makes an attack against a target other than you, you can use your reaction to make a melee weapon attack against it.$$
 ], false, array[$$melee$$, $$control$$, $$reaction$$]),

($$Sharpshooter$$, $$combat$$, null,
 $$You have mastered ranged weapons and can make shots others find impossible.$$,
 array[
   $$Attacking at long range doesn't impose disadvantage on your ranged weapon attack rolls.$$,
   $$Your ranged weapon attacks ignore half cover and three-quarters cover.$$,
   $$Before you make a ranged attack with a weapon you are proficient with, you can choose to take a -5 penalty to the attack roll; if it hits, you add +10 to the attack's damage.$$
 ], false, array[$$ranged$$]),

($$Shield Master$$, $$combat$$, null,
 $$You use a shield as a weapon and a wall, not just a plate to hide behind.$$,
 array[
   $$If you take the Attack action on your turn, you can use a bonus action to shove a creature within 5 feet of you with your shield.$$,
   $$If you aren't incapacitated, you can add your shield's AC bonus to any Dexterity saving throw against an effect that targets only you.$$,
   $$If you are subjected to an effect that allows a Dexterity save for half damage, you can use your reaction to take no damage on a success.$$
 ], false, array[$$defense$$, $$shield$$]),

($$Tavern Brawler$$, $$combat$$, null,
 $$You learned to fight in the common room, with fists, bottles and whatever else came to hand.$$,
 array[
   $$Increase your Strength or Constitution by 1, to a maximum of 20.$$,
   $$You are proficient with improvised weapons.$$,
   $$Your unarmed strike uses a d4 for damage.$$,
   $$When you hit with an unarmed strike or improvised weapon on your turn, you can use a bonus action to attempt to grapple the target.$$
 ], false, array[$$unarmed$$, $$half-feat$$]),

($$Weapon Master$$, $$combat$$, null,
 $$You have practised with a wider range of arms than your training gave you.$$,
 array[
   $$Increase your Strength or Dexterity by 1, to a maximum of 20.$$,
   $$You gain proficiency with four weapons of your choice.$$
 ], false, array[$$proficiency$$, $$half-feat$$]),

-- ---------------------------------------------------------------------------
-- defense
-- ---------------------------------------------------------------------------

($$Durable$$, $$defense$$, null,
 $$You are hard to put down and quick to get back up.$$,
 array[
   $$Increase your Constitution by 1, to a maximum of 20.$$,
   $$When you roll a Hit Die to regain hit points, the minimum you regain is twice your Constitution modifier.$$
 ], false, array[$$survivability$$, $$half-feat$$]),

($$Heavily Armored$$, $$defense$$, $$Proficiency with medium armor$$,
 $$You have trained to bear the weight of a full harness.$$,
 array[
   $$Increase your Strength by 1, to a maximum of 20.$$,
   $$You gain proficiency with heavy armor.$$
 ], false, array[$$armor$$, $$half-feat$$]),

($$Heavy Armor Master$$, $$defense$$, $$Proficiency with heavy armor$$,
 $$Plate turns the ordinary weapons of the world into an annoyance.$$,
 array[
   $$Increase your Strength by 1, to a maximum of 20.$$,
   $$While you are wearing heavy armor, bludgeoning, piercing and slashing damage from nonmagical weapons is reduced by 3.$$
 ], false, array[$$armor$$, $$half-feat$$]),

($$Lightly Armored$$, $$defense$$, null,
 $$You have picked up the habit of wearing armor at all.$$,
 array[
   $$Increase your Strength or Dexterity by 1, to a maximum of 20.$$,
   $$You gain proficiency with light armor.$$
 ], false, array[$$armor$$, $$half-feat$$]),

($$Medium Armor Master$$, $$defense$$, $$Proficiency with medium armor$$,
 $$You wear a breastplate the way others wear a coat.$$,
 array[
   $$Wearing medium armor doesn't impose disadvantage on your Dexterity (Stealth) checks.$$,
   $$When you wear medium armor, you can add 3 rather than 2 to your AC if you have a Dexterity of 16 or higher.$$
 ], false, array[$$armor$$, $$stealth$$]),

($$Moderately Armored$$, $$defense$$, $$Proficiency with light armor$$,
 $$You have trained up from padding to mail, and taken a shield with it.$$,
 array[
   $$Increase your Strength or Dexterity by 1, to a maximum of 20.$$,
   $$You gain proficiency with medium armor and shields.$$
 ], false, array[$$armor$$, $$half-feat$$]),

($$Tough$$, $$defense$$, null,
 $$There is simply more of you to get through.$$,
 array[
   $$Your hit point maximum increases by an amount equal to twice your level when you gain this feat, and by 2 every level thereafter.$$
 ], false, array[$$survivability$$]),

-- ---------------------------------------------------------------------------
-- magic
-- ---------------------------------------------------------------------------

($$Elemental Adept$$, $$magic$$, $$The ability to cast at least one spell$$,
 $$You have bent one element to your will more thoroughly than the rest.$$,
 array[
   $$Choose acid, cold, fire, lightning or thunder. Spells you cast ignore resistance to that damage type.$$,
   $$When you roll damage for a spell that deals that type, you treat any 1 on a damage die as a 2.$$,
   $$You can select this feat more than once, choosing a different damage type each time.$$
 ], true, array[$$damage$$, $$elemental$$]),

($$Mage Slayer$$, $$magic$$, null,
 $$You have fought your way through enough spellcasters to know where to stand.$$,
 array[
   $$When a creature within 5 feet of you casts a spell, you can use your reaction to make a melee weapon attack against it.$$,
   $$When you damage a creature concentrating on a spell, it has disadvantage on the saving throw to maintain concentration.$$,
   $$You have advantage on saving throws against spells cast by creatures within 5 feet of you.$$
 ], false, array[$$anti-magic$$, $$reaction$$]),

($$Magic Initiate$$, $$magic$$, null,
 $$You have studied at the edge of one tradition and come away with a little of its craft.$$,
 array[
   $$Choose bard, cleric, druid, sorcerer, warlock or wizard. You learn two cantrips of your choice from that class's spell list.$$,
   $$You learn one 1st-level spell from the same list, and can cast it once at its lowest level per long rest.$$,
   $$Your spellcasting ability is the one used by the class you chose. You can select this feat more than once.$$
 ], true, array[$$spellcasting$$]),

($$Ritual Caster$$, $$magic$$, $$Intelligence or Wisdom 13 or higher$$,
 $$You have learned to work the slow, careful magic that needs time rather than power.$$,
 array[
   $$Choose a class with the Ritual Casting feature. You gain a ritual book holding two 1st-level ritual spells from that class's list.$$,
   $$You can cast those spells as rituals, and only as rituals, using the chosen class's spellcasting ability.$$,
   $$You can add further ritual spells of a level you could cast to the book by finding and copying them.$$
 ], false, array[$$spellcasting$$, $$ritual$$]),

($$Spell Sniper$$, $$magic$$, $$The ability to cast at least one spell$$,
 $$Your spells reach further and find their mark through cover.$$,
 array[
   $$When you cast a spell that requires an attack roll, its range is doubled.$$,
   $$Your ranged spell attacks ignore half cover and three-quarters cover.$$,
   $$You learn one cantrip that requires an attack roll, from any class's spell list.$$
 ], false, array[$$spellcasting$$, $$ranged$$]),

($$War Caster$$, $$magic$$, $$The ability to cast at least one spell$$,
 $$You have learned to cast with a weapon in hand and a blade coming at you.$$,
 array[
   $$You have advantage on Constitution saving throws to maintain concentration when you take damage.$$,
   $$You can perform the somatic components of spells even when you have weapons or a shield in one or both hands.$$,
   $$When a creature provokes an opportunity attack from you, you can use your reaction to cast a 1-action spell at it instead of making the attack.$$
 ], false, array[$$spellcasting$$, $$concentration$$]),

-- ---------------------------------------------------------------------------
-- skill
-- ---------------------------------------------------------------------------

($$Athlete$$, $$skill$$, null,
 $$You are quick on your feet and quicker back onto them.$$,
 array[
   $$Increase your Strength or Dexterity by 1, to a maximum of 20.$$,
   $$When you are prone, standing up uses only 5 feet of movement.$$,
   $$Climbing doesn't cost you extra movement.$$,
   $$You can make a running long or high jump after moving only 5 feet on foot, rather than 10.$$
 ], false, array[$$movement$$, $$half-feat$$]),

($$Dungeon Delver$$, $$skill$$, null,
 $$You read a corridor the way others read a page, and you do not tire of walking it.$$,
 array[
   $$You have advantage on Perception and Investigation checks made to detect secret doors.$$,
   $$You have advantage on saving throws against traps, and resistance to damage dealt by traps.$$,
   $$You can search for traps while travelling at a normal pace instead of a slow one.$$
 ], false, array[$$exploration$$, $$traps$$]),

($$Healer$$, $$skill$$, null,
 $$You know what to do with a healer's kit and a body that has stopped moving.$$,
 array[
   $$When you use a healer's kit to stabilise a creature, it also regains 1 hit point.$$,
   $$As an action, you can spend one use of a healer's kit to restore 1d6 + 4 hit points to a creature, plus its number of Hit Dice. It cannot regain hit points this way again until it finishes a short or long rest.$$
 ], false, array[$$support$$, $$healing$$]),

($$Keen Mind$$, $$skill$$, null,
 $$You forget nothing, and you always know roughly where you are.$$,
 array[
   $$Increase your Intelligence by 1, to a maximum of 20.$$,
   $$You always know which way is north and how many hours remain before the next sunrise or sunset.$$,
   $$You can accurately recall anything you have seen or heard within the past month.$$
 ], false, array[$$knowledge$$, $$half-feat$$]),

($$Linguist$$, $$skill$$, null,
 $$You have a head for languages and for hiding things inside them.$$,
 array[
   $$Increase your Intelligence by 1, to a maximum of 20.$$,
   $$You learn three languages of your choice.$$,
   $$You can create written ciphers, which others cannot decipher without your teaching or a successful Intelligence check against your cipher's DC.$$
 ], false, array[$$knowledge$$, $$half-feat$$]),

($$Mobile$$, $$skill$$, null,
 $$You are hard to pin down and harder to catch.$$,
 array[
   $$Your speed increases by 10 feet.$$,
   $$When you use the Dash action, difficult terrain doesn't cost you extra movement that turn.$$,
   $$When you make a melee attack against a creature, you don't provoke opportunity attacks from it for the rest of the turn.$$
 ], false, array[$$movement$$]),

($$Observant$$, $$skill$$, null,
 $$Very little in a room escapes you, including what is being said across it.$$,
 array[
   $$Increase your Intelligence or Wisdom by 1, to a maximum of 20.$$,
   $$If you can see a creature's mouth while it speaks a language you understand, you can read its lips.$$,
   $$You gain a +5 bonus to your passive Perception and passive Investigation.$$
 ], false, array[$$perception$$, $$half-feat$$]),

($$Skilled$$, $$skill$$, null,
 $$Your interests are broad and your training shows it.$$,
 array[
   $$You gain proficiency in any combination of three skills or tools of your choice.$$
 ], false, array[$$proficiency$$]),

($$Skulker$$, $$skill$$, $$Dexterity 13 or higher$$,
 $$You are at home in the half-dark, and hard to place while you are in it.$$,
 array[
   $$You can try to hide when you are only lightly obscured.$$,
   $$When you are hidden and miss with a ranged weapon attack, making the attack doesn't reveal your position.$$,
   $$Dim light doesn't impose disadvantage on your Wisdom (Perception) checks that rely on sight.$$
 ], false, array[$$stealth$$]),

-- ---------------------------------------------------------------------------
-- social
-- ---------------------------------------------------------------------------

($$Actor$$, $$social$$, null,
 $$You can be someone else convincingly enough that people act on it.$$,
 array[
   $$Increase your Charisma by 1, to a maximum of 20.$$,
   $$You have advantage on Deception and Performance checks when trying to pass yourself off as a different person.$$,
   $$You can mimic the speech of a person or the sounds of a creature you have heard, well enough that a listener must succeed on a Wisdom (Insight) check against your Deception to know the difference.$$
 ], false, array[$$deception$$, $$half-feat$$]),

($$Inspiring Leader$$, $$social$$, null,
 $$You can put heart back into people who have run out of it.$$,
 array[
   $$You can spend 10 minutes inspiring up to six friendly creatures (which can include you) within 30 feet who can see, hear and understand you.$$,
   $$Each gains temporary hit points equal to your level plus your Charisma modifier. A creature cannot gain them again from this feat until it finishes a short or long rest.$$
 ], false, array[$$support$$, $$temporary hp$$]),

-- ---------------------------------------------------------------------------
-- general
-- ---------------------------------------------------------------------------

($$Alert$$, $$general$$, null,
 $$Nothing catches you unprepared, and nothing gets to move before you do.$$,
 array[
   $$You gain a +5 bonus to initiative.$$,
   $$You cannot be surprised while you are conscious.$$,
   $$Other creatures do not gain advantage on attack rolls against you as a result of being unseen by you.$$
 ], false, array[$$initiative$$]),

($$Lucky$$, $$general$$, null,
 $$Fortune leans your way at the moments that matter, three times a day.$$,
 array[
   $$You have 3 luck points, regained on a long rest.$$,
   $$When you make an attack roll, ability check or saving throw, you can spend a luck point to roll an additional d20 and choose which to use.$$,
   $$When a creature attacks you, you can spend a luck point to roll a d20 and choose which of the two rolls its attack uses.$$
 ], false, array[$$fortune$$]),

($$Resilient$$, $$general$$, null,
 $$One of your weaknesses is a weakness no longer.$$,
 array[
   $$Choose one ability score. Increase it by 1, to a maximum of 20.$$,
   $$You gain proficiency in saving throws using that ability.$$
 ], false, array[$$saving throws$$, $$half-feat$$]);

insert into public.schema_migrations (version) values ('040');

commit;


-- ===========================================================================
-- VERIFICATION -- run before touching client code
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- BLOCK 0: the counts are the ones the header claims
-- ---------------------------------------------------------------------------
--
-- CORRECT OUTPUT: six rows -- combat 15, defense 7, general 3, magic 6,
--                 skill 9, social 2.

select category, count(*)
  from feats
 where campaign_id is null
 group by category
 order by category;


-- ---------------------------------------------------------------------------
-- BLOCK 1: forty-two shared feats, every one of them well-formed
-- ---------------------------------------------------------------------------
--
-- CORRECT OUTPUT: one row, total 42 and every other column `t`.

select
  count(*)                                                    as total,
  count(*) = 42                                               as all_present,
  bool_and(name = trim(name) and name <> '')                  as names_clean,
  bool_and(description <> '')                                 as descriptions_present,
  bool_and(cardinality(benefits) > 0)                         as benefits_present,
  count(*) filter (where prerequisite is not null) = 11       as eleven_prereqs,
  count(*) filter (where repeatable) = 2                      as two_repeatable,
  count(distinct name) = count(*)                             as names_unique
from feats
where campaign_id is null;


-- ---------------------------------------------------------------------------
-- BLOCK 2: spot-check the two feats the card singles out
-- ---------------------------------------------------------------------------
--
-- CORRECT OUTPUT: two rows -- Elemental Adept and Magic Initiate.

select name, repeatable, prerequisite
  from feats
 where campaign_id is null and repeatable
 order by name;


-- ---------------------------------------------------------------------------
-- Then let PostgREST see 039's table:
--
--   notify pgrst, 'reload schema';
--
-- and regenerate the client types:
--
--   npm run gen:types
-- ---------------------------------------------------------------------------
