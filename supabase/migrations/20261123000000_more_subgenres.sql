-- =============================================================================
-- Chronovault — more built-in subgenres
--
-- 1. New built-in subgenres under the existing genres (Metal › Rap Metal,
--    Folk › Medieval Folk…), names still unique across the whole list.
--
-- 2. A user's own subgenre named like a new built-in one (case and spaces
--    aside) gives way to it: its tracks move to the built-in subgenre, and to
--    its genre (the name now says which genre it is in), then it is deleted.
--    Left alone it would break private.check_subgenre_name's rule on its next
--    rename, and the editor would list the name twice.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The new built-in subgenres, by genre.
-- -----------------------------------------------------------------------------
create temporary table new_subgenres as
select g.id as genre_id, sub.name
from (values
  ('Blues', array[
    'Desert Blues', 'Detroit Blues', 'Gospel Blues', 'Jug Band', 'Kansas City Blues',
    'New Orleans Blues', 'Punk Blues', 'St. Louis Blues', 'Talking Blues', 'West Coast Blues'
  ]),
  ('Country', array[
    'Contemporary Country', 'Cosmic Country', 'Country Boogie', 'Country Folk', 'Country Soul',
    'Countrypolitan', 'Progressive Country', 'Truck-Driving Country'
  ]),
  ('Electronic', array[
    'Acid Techno', 'Ambient House', 'Ambient Techno', 'Balearic Beat', 'Bassline', 'Berlin School',
    'Big Room', 'Breakbeat Hardcore', 'Brostep', 'Chicago House', 'Complextro', 'Dark Electro',
    'Darkstep', 'Darksynth', 'Detroit Techno', 'Digital Hardcore', 'Dungeon Synth',
    'Electro-Industrial', 'Folktronica', 'Frenchcore', 'Funky House', 'Future House', 'Glitch Hop',
    'Goa Trance', 'Gqom', 'Halftime', 'Hard House', 'Hard Techno', 'Hard Trance', 'Hardcore Techno',
    'Hip House', 'Indie Dance', 'Industrial Techno', 'Italo House', 'Jump Up', 'Kwaito',
    'Liquid Drum & Bass', 'Melodic House', 'Microhouse', 'Neurofunk', 'New Beat', 'Nightcore',
    'Nu Skool Breaks', 'Organic House', 'Outrun', 'Progressive Trance', 'Psybient', 'Ragga Jungle',
    'Slap House', 'Spacesynth', 'Speed Garage', 'Tropical House', 'Uplifting Trance', 'Vocal Trance',
    'Wonky'
  ]),
  ('Experimental', array[
    'Circuit Bending', 'Death Industrial', 'Harsh Noise', 'Harsh Noise Wall', 'Hauntology',
    'Japanoise', 'Martial Industrial', 'Microsound', 'Onkyo', 'Post-Industrial', 'Ritual Ambient',
    'Sound Poetry'
  ]),
  ('Folk', array[
    'American Primitive', 'Andean Folk', 'Bardcore', 'British Folk', 'Cajun', 'Canzone Napoletana',
    'Dark Folk', 'Folk Baroque', 'Folk Revival', 'Italian Folk', 'Joik', 'Medieval Folk', 'Old-Time',
    'Pagan Folk', 'Progressive Folk', 'Protest Folk', 'Romani Folk', 'Scottish Folk',
    'Stomp and Holler', 'Turkish Folk', 'Zydeco'
  ]),
  ('Funk & Disco', array[
    'Afro-Funk', 'Cosmic Disco', 'Deep Funk', 'Disco Polo', 'Modern Funk', 'Post-Disco',
    'Psychedelic Funk'
  ]),
  ('Gospel & Religious', array[
    'Bhajan', 'Byzantine Chant', 'Cantorial', 'Christian Pop', 'Kirtan', 'Nasheed', 'Sacred Harp',
    'Sufi', 'Traditional Gospel', 'Urban Contemporary Gospel'
  ]),
  ('Hip-Hop', array[
    'Afro Trap', 'Afroswing', 'Brooklyn Drill', 'Chopped and Screwed', 'Comedy Rap', 'Digicore',
    'Dirty South', 'Experimental Hip-Hop', 'French Hip-Hop', 'German Hip-Hop', 'Hyphy',
    'Industrial Hip-Hop', 'Italian Hip-Hop', 'Latin Hip-Hop', 'Mumble Rap', 'Nerdcore', 'Plugg',
    'Pluggnb', 'Political Hip-Hop', 'Snap', 'Trap Metal', 'UK Hip-Hop', 'Underground Hip-Hop'
  ]),
  ('Jazz', array[
    'Afro-Cuban Jazz', 'Brazilian Jazz', 'Chamber Jazz', 'Dark Jazz', 'Indo-Jazz', 'Jazz Blues',
    'Jazz Pop', 'Jazz Rock', 'Kansas City Jazz', 'Mainstream Jazz', 'New Orleans Jazz',
    'Orchestral Jazz', 'Progressive Jazz', 'Stride Piano', 'Vocalese', 'West Coast Jazz'
  ]),
  ('Latin', array[
    'Axé', 'Baião', 'Boogaloo', 'Bomba', 'Brega', 'Candombe', 'Chamamé', 'Champeta', 'Chicha',
    'Choro', 'Corridos Tumbados', 'Cuarteto', 'Danzón', 'Electrotango', 'Guaracha', 'Huayno',
    'Joropo', 'Latin Alternative', 'Latin Soul', 'Nueva Trova', 'Pagode', 'Plena', 'Ranchera',
    'Rumba', 'Sertanejo', 'Timba'
  ]),
  ('Metal', array[
    'Atmospheric Black Metal', 'Avant-Garde Metal', 'Black ''n'' Roll', 'Brutal Death Metal',
    'Celtic Metal', 'Crossover Thrash', 'Death ''n'' Roll', 'Death-Doom', 'Depressive Black Metal',
    'Drone Metal', 'Epic Doom', 'Funeral Doom', 'Funk Metal', 'Goregrind', 'Kawaii Metal',
    'Mathcore', 'Medieval Metal', 'Melodic Black Metal', 'Melodic Metalcore', 'Neoclassical Metal',
    'Neue Deutsche Härte', 'Oriental Metal', 'Pagan Metal', 'Pirate Metal', 'Rap Metal', 'Rapcore',
    'Southern Metal', 'Symphonic Black Metal', 'Technical Death Metal', 'War Metal'
  ]),
  ('New Age', array[
    'Mantra', 'Native American Flute', 'New Age Piano', 'Shamanic', 'Singing Bowls', 'Sleep Music',
    'Solfeggio Frequencies', 'Yoga Music'
  ]),
  ('Other', array[
    'Arabesque', 'Art Song', 'Ballroom', 'Brass Band', 'Carnatic', 'Classical Period', 'Dangdut',
    'Hindustani', 'Impressionism', 'Isicathamiya', 'Juju', 'Kizomba', 'Kompa', 'Makossa',
    'Mbaqanga', 'Morna', 'Novelty', 'Operetta', 'Orchestral', 'Post-Minimalism', 'Serialism',
    'Solo Piano', 'Spectralism', 'Steelpan', 'Taarab', 'Trot', 'Zouk'
  ]),
  ('Pop', array[
    'Alternative Pop', 'Ambient Pop', 'Arabic Pop', 'Cantopop', 'Experimental Pop', 'French Pop',
    'Glitch Pop', 'Hypnagogic Pop', 'Indian Pop', 'Italian Pop', 'Jangle Pop', 'Mandopop',
    'Progressive Pop', 'Psychedelic Pop', 'Shibuya-kei', 'Space Age Pop', 'Twee Pop', 'Vocaloid',
    'Yé-yé'
  ]),
  ('Punk', array[
    'Celtic Punk', 'D-Beat', 'Deathrock', 'Easycore', 'Egg Punk', 'Glam Punk', 'Gypsy Punk',
    'Metallic Hardcore', 'New York Hardcore', 'No Wave', 'Post-Punk Revival', 'Punk Rock',
    'Queercore', 'Thrashcore', 'UK82', 'Youth Crew'
  ]),
  ('R&B & Soul', array[
    'Chicago Soul', 'Deep Soul', 'Hip-Hop Soul', 'Memphis Soul', 'Modern Soul', 'New Orleans R&B',
    'Pop Soul', 'Retro Soul', 'Smooth Soul', 'Trap Soul'
  ]),
  ('Reggae', array[
    'Conscious Reggae', 'Early Reggae', 'Nyabinghi', 'Reggae Rock', 'Rockers', 'Skinhead Reggae',
    'Steppers', 'Third Wave Ska'
  ]),
  ('Rock', array[
    'Acoustic Rock', 'Avant-Prog', 'British Invasion', 'Celtic Rock', 'Coldwave', 'Comedy Rock',
    'Dance Rock', 'Desert Rock', 'Ethereal Wave', 'Experimental Rock', 'Garage Rock Revival',
    'Industrial Rock', 'Instrumental Rock', 'Italian Progressive Rock', 'J-Rock', 'Jam Band',
    'Madchester', 'Medieval Rock', 'Merseybeat', 'Neo-Prog', 'Neo-Psychedelia', 'Noise Pop',
    'Piano Rock', 'Post-Britpop', 'Proto-Metal', 'Pub Rock', 'Rock Opera', 'Roots Rock',
    'Swamp Rock', 'Visual Kei', 'Zeuhl'
  ]),
  ('Soundtrack', array[
    'Cartoon Music', 'Epic Orchestral', 'Horror Score', 'Jingles', 'Spaghetti Western'
  ])
) as list (genre, names)
join public.genres g on g.name = list.genre
cross join lateral unnest(list.names) as sub (name);

-- Built-in rows skip private.check_subgenre_name; subgenres_builtin_name_key
-- still rejects a name already in the list.
insert into public.subgenres (genre_id, name)
select genre_id, name from new_subgenres;

-- -----------------------------------------------------------------------------
-- 2. Users' own subgenres with a new built-in name give way to it.
-- -----------------------------------------------------------------------------
create temporary table superseded_subgenres as
select own.id as own_id, builtin.id as builtin_id, builtin.genre_id
from public.subgenres own
join new_subgenres n on lower(btrim(n.name)) = lower(btrim(own.name))
join public.subgenres builtin
  on builtin.user_id is null and builtin.genre_id = n.genre_id and builtin.name = n.name
where own.user_id is not null;

-- `updated_at` is left alone: the tracks did not change for their owners, and
-- it versions their cover addresses.
alter table public.tracks disable trigger tracks_set_updated_at;

update public.tracks t
set genre_id = s.genre_id, subgenre_id = s.builtin_id
from superseded_subgenres s
where t.subgenre_id = s.own_id;

alter table public.tracks enable trigger tracks_set_updated_at;

delete from public.subgenres
where id in (select own_id from superseded_subgenres);

drop table new_subgenres, superseded_subgenres;
