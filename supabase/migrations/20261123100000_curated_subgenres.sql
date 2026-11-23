-- =============================================================================
-- Chronovault — the built-in subgenres: the main ones only
--
-- A long list of niche names buries the ones people use, in the editor and in
-- the filters: the list keeps the common names (247 of 760).
--
-- A removed subgenre still on a track lives on as its owner's own, same genre
-- and name, so no track loses its classification. Tracks' `updated_at` is left
-- alone: the tracks did not change for their owners, and it versions their
-- cover addresses.
-- =============================================================================

create temporary table removed_subgenres as
select s.id, s.genre_id, s.name
from (values
  ('Blues', array[
    'Boogie-Woogie', 'Desert Blues', 'Detroit Blues', 'Hill Country Blues', 'Jug Band',
    'Jump Blues', 'Kansas City Blues', 'Louisiana Blues', 'Memphis Blues', 'New Orleans Blues',
    'Piedmont Blues', 'Punk Blues', 'St. Louis Blues', 'Swamp Blues', 'Talking Blues',
    'West Coast Blues'
  ]),
  ('Country', array[
    'Bakersfield Sound', 'Bro-Country', 'Cosmic Country', 'Country Boogie', 'Country Folk',
    'Country Rap', 'Countrypolitan', 'Cowpunk', 'Gothic Country', 'Nashville Sound',
    'Neotraditional Country', 'Progressive Bluegrass', 'Progressive Country', 'Red Dirt',
    'Texas Country', 'Truck-Driving Country', 'Western Swing'
  ]),
  ('Electronic', array[
    'Acid House', 'Acid Techno', 'Afro House', 'Ambient House', 'Ambient Techno', 'Balearic Beat',
    'Bass House', 'Bassline', 'Berlin School', 'Big Beat', 'Big Room', 'Breakbeat Hardcore',
    'Breakcore', 'Brostep', 'Chicago House', 'Chillwave', 'Complextro', 'Dark Ambient',
    'Dark Electro', 'Darkstep', 'Darksynth', 'Detroit Techno', 'Digital Hardcore', 'Dub Techno',
    'Dungeon Synth', 'EBM', 'Electro House', 'Electro-Industrial', 'Electroclash', 'Folktronica',
    'Footwork', 'French House', 'Frenchcore', 'Funky House', 'Future Bass', 'Future Garage',
    'Future House', 'Gabber', 'Glitch', 'Glitch Hop', 'Goa Trance', 'Gqom', 'Halftime',
    'Happy Hardcore', 'Hard House', 'Hard Techno', 'Hard Trance', 'Hardcore Techno', 'Hip House',
    'Indie Dance', 'Industrial Techno', 'Italo House', 'Jersey Club', 'Jump Up', 'Jungle',
    'Kwaito', 'Liquid Drum & Bass', 'Lo-fi House', 'Melodic House', 'Melodic Techno', 'Microhouse',
    'Minimal Techno', 'Moombahton', 'Neurofunk', 'New Beat', 'Nightcore', 'Nu Skool Breaks',
    'Organic House', 'Outrun', 'Progressive Trance', 'Psybient', 'Ragga Jungle', 'Slap House',
    'Spacesynth', 'Speed Garage', 'Tropical House', 'Uplifting Trance', 'Vaporwave',
    'Vocal Trance', 'Witch House', 'Wonky'
  ]),
  ('Experimental', array[
    'Circuit Bending', 'Death Industrial', 'Electroacoustic', 'Free Improvisation', 'Harsh Noise',
    'Harsh Noise Wall', 'Hauntology', 'Japanoise', 'Lowercase', 'Martial Industrial', 'Microsound',
    'Onkyo', 'Plunderphonics', 'Post-Industrial', 'Power Electronics', 'Ritual Ambient',
    'Sound Art', 'Sound Collage', 'Sound Poetry', 'Tape Music'
  ]),
  ('Folk', array[
    'American Primitive', 'Andean Folk', 'Anti-Folk', 'Appalachian Folk', 'Balkan Folk',
    'Bardcore', 'British Folk', 'Cajun', 'Canzone Napoletana', 'Chamber Folk', 'Folk Baroque',
    'Folk Revival', 'Freak Folk', 'Joik', 'Klezmer', 'Nordic Folk', 'Old-Time', 'Polka',
    'Progressive Folk', 'Protest Folk', 'Psychedelic Folk', 'Rebetiko', 'Romani Folk',
    'Scottish Folk', 'Stomp and Holler', 'Turkish Folk', 'Zydeco'
  ]),
  ('Funk & Disco', array[
    'Afro-Funk', 'Boogie', 'Cosmic Disco', 'Deep Funk', 'Disco Polo', 'Electro-Funk', 'Go-Go',
    'Hi-NRG', 'Minneapolis Sound', 'Modern Funk', 'Post-Disco', 'Psychedelic Funk', 'Space Disco',
    'Synth-Funk'
  ]),
  ('Gospel & Religious', array[
    'Bhajan', 'Byzantine Chant', 'Cantorial', 'Christian Pop', 'Devotional', 'Kirtan', 'Nasheed',
    'Qawwali', 'Sacred Harp', 'Sufi', 'Traditional Gospel', 'Urban Contemporary Gospel'
  ]),
  ('Hip-Hop', array[
    'Abstract Hip-Hop', 'Afro Trap', 'Afroswing', 'Bounce', 'Brooklyn Drill',
    'Chopped and Screwed', 'Christian Hip-Hop', 'Cloud Rap', 'Comedy Rap', 'Crunk', 'Digicore',
    'Dirty South', 'Experimental Hip-Hop', 'French Hip-Hop', 'G-Funk', 'German Hip-Hop',
    'Hardcore Hip-Hop', 'Horrorcore', 'Hyphy', 'Industrial Hip-Hop', 'Instrumental Hip-Hop',
    'Latin Hip-Hop', 'Memphis Rap', 'Mumble Rap', 'Nerdcore', 'Plugg', 'Pluggnb',
    'Political Hip-Hop', 'Rage', 'Snap', 'Trap Metal', 'Turntablism', 'UK Drill', 'UK Hip-Hop',
    'Underground Hip-Hop'
  ]),
  ('Jazz', array[
    'Afro-Cuban Jazz', 'Avant-Garde Jazz', 'Brazilian Jazz', 'Chamber Jazz', 'Dark Jazz',
    'Ethio-Jazz', 'Indo-Jazz', 'Jazz Pop', 'Jazz Rock', 'Jazz-Funk', 'Kansas City Jazz',
    'Mainstream Jazz', 'Modal Jazz', 'New Orleans Jazz', 'Nu Jazz', 'Orchestral Jazz', 'Post-Bop',
    'Progressive Jazz', 'Ragtime', 'Soul Jazz', 'Spiritual Jazz', 'Stride Piano', 'Third Stream',
    'Vocalese', 'West Coast Jazz'
  ]),
  ('Latin', array[
    'Axé', 'Baião', 'Baile Funk', 'Banda', 'Bomba', 'Boogaloo', 'Brega', 'Candombe', 'Cha-Cha-Chá',
    'Chamamé', 'Champeta', 'Chicha', 'Choro', 'Corridos', 'Corridos Tumbados', 'Cuarteto',
    'Danzón', 'Dembow', 'Electrotango', 'Forró', 'Guaracha', 'Huayno', 'Joropo',
    'Latin Alternative', 'Latin Soul', 'Mambo', 'MPB', 'Norteño', 'Nueva Canción', 'Nueva Trova',
    'Pagode', 'Plena', 'Ranchera', 'Rumba', 'Sertanejo', 'Son Cubano', 'Tejano', 'Timba',
    'Tropicália', 'Vallenato'
  ]),
  ('Metal', array[
    'Atmospheric Black Metal', 'Black ''n'' Roll', 'Blackgaze', 'Brutal Death Metal',
    'Celtic Metal', 'Christian Metal', 'Crossover Thrash', 'Death ''n'' Roll', 'Death-Doom',
    'Depressive Black Metal', 'Drone Metal', 'Epic Doom', 'Funeral Doom', 'Funk Metal',
    'Goregrind', 'Grindcore', 'Mathcore', 'Medieval Metal', 'Melodic Black Metal',
    'Melodic Metalcore', 'Neoclassical Metal', 'Neue Deutsche Härte', 'NWOBHM', 'Oriental Metal',
    'Post-Metal', 'Rapcore', 'Sludge Metal', 'Southern Metal', 'Speed Metal',
    'Symphonic Black Metal', 'Technical Death Metal', 'Viking Metal', 'War Metal'
  ]),
  ('New Age', array[
    'Binaural Beats', 'Celtic New Age', 'Mantra', 'Native American Flute', 'New Age Piano',
    'Shamanic', 'Singing Bowls', 'Sleep Music', 'Solfeggio Frequencies', 'Space Music',
    'Yoga Music'
  ]),
  ('Other', array[
    'Arabesque', 'Art Song', 'Ballroom', 'Barbershop', 'Bhangra', 'Brass Band', 'Calypso',
    'Carnatic', 'Chinese Traditional', 'Classical Period', 'Dangdut', 'Enka', 'Exotica', 'Gamelan',
    'Gnawa', 'Highlife', 'Hindustani', 'Impressionism', 'Indian Classical', 'Isicathamiya', 'Juju',
    'Kizomba', 'Kompa', 'Lullabies', 'Makossa', 'Maqam', 'Marching Band', 'Mbalax', 'Mbaqanga',
    'Minimalism', 'Morna', 'Novelty', 'Operetta', 'Orchestral', 'Post-Minimalism', 'Rai',
    'Serialism', 'Soca', 'Solo Piano', 'Soukous', 'Spectralism', 'Steelpan', 'Taarab',
    'Throat Singing', 'Trot', 'Zouk'
  ]),
  ('Pop', array[
    'Alternative Pop', 'Ambient Pop', 'Arabic Pop', 'Baroque Pop', 'Bedroom Pop', 'Bubblegum Pop',
    'Cantopop', 'Chamber Pop', 'City Pop', 'Experimental Pop', 'French Pop', 'Glitch Pop',
    'Hypnagogic Pop', 'Indian Pop', 'Jangle Pop', 'Mandopop', 'Progressive Pop', 'Psychedelic Pop',
    'Schlager', 'Shibuya-kei', 'Sophisti-Pop', 'Space Age Pop', 'Sunshine Pop', 'Teen Pop',
    'Traditional Pop', 'Twee Pop', 'Vocaloid', 'Yé-yé'
  ]),
  ('Punk', array[
    'Anarcho-Punk', 'Art Punk', 'Crust Punk', 'D-Beat', 'Dance-Punk', 'Deathrock', 'Easycore',
    'Egg Punk', 'Garage Punk', 'Glam Punk', 'Gypsy Punk', 'Horror Punk', 'Melodic Hardcore',
    'Metallic Hardcore', 'Midwest Emo', 'New York Hardcore', 'No Wave', 'Oi!', 'Post-Punk Revival',
    'Powerviolence', 'Proto-Punk', 'Psychobilly', 'Queercore', 'Riot Grrrl', 'Synth-Punk',
    'Thrashcore', 'UK82', 'Youth Crew'
  ]),
  ('R&B & Soul', array[
    'Blue-Eyed Soul', 'Chicago Soul', 'Deep Soul', 'Hip-Hop Soul', 'Memphis Soul', 'Modern Soul',
    'New Orleans R&B', 'Northern Soul', 'Philly Soul', 'Pop Soul', 'Psychedelic Soul',
    'Quiet Storm', 'Retro Soul', 'Smooth Soul', 'Southern Soul', 'Trap Soul'
  ]),
  ('Reggae', array[
    'Conscious Reggae', 'Dub Poetry', 'Early Reggae', 'Lovers Rock', 'Mento', 'Nyabinghi', 'Ragga',
    'Reggae Rock', 'Rockers', 'Skinhead Reggae', 'Steppers', 'Third Wave Ska', 'Two-Tone'
  ]),
  ('Rock', array[
    'Acid Rock', 'Acoustic Rock', 'Arena Rock', 'Art Rock', 'Avant-Prog', 'British Invasion',
    'Celtic Rock', 'Christian Rock', 'Coldwave', 'Comedy Rock', 'Dance Rock', 'Desert Rock',
    'Ethereal Wave', 'Experimental Rock', 'Garage Rock Revival', 'Heartland Rock',
    'Industrial Rock', 'Instrumental Rock', 'Italian Progressive Rock', 'J-Rock', 'Jam Band',
    'Krautrock', 'Madchester', 'Math Rock', 'Merseybeat', 'Neo-Prog', 'Neo-Psychedelia',
    'Noise Pop', 'Noise Rock', 'Piano Rock', 'Post-Britpop', 'Power Pop', 'Proto-Metal',
    'Pub Rock', 'Rock Opera', 'Roots Rock', 'Slowcore', 'Space Rock', 'Swamp Rock',
    'Symphonic Rock', 'Visual Kei', 'Yacht Rock', 'Zeuhl'
  ]),
  ('Soundtrack', array[
    'Bollywood', 'Cartoon Music', 'Epic Orchestral', 'Horror Score', 'Jingles', 'Library Music',
    'Spaghetti Western', 'Trailer Music'
  ])
) as list (genre, names)
join public.genres g on g.name = list.genre
cross join lateral unnest(list.names) as sub (name)
join public.subgenres s on s.user_id is null and s.genre_id = g.id and s.name = sub.name;

-- Every name above must be found: a misspelt one would silently stay.
do $$
begin
  if (select count(*) from removed_subgenres) <> 513 then
    raise exception 'removed subgenres: % of 513 names found', (select count(*) from removed_subgenres);
  end if;
end;
$$;

-- Read before the delete, whose foreign key clears the tracks' subgenre_id.
create temporary table orphaned_tracks as
select t.id as track_id, t.user_id, r.genre_id, r.name
from public.tracks t
join removed_subgenres r on r.id = t.subgenre_id;

alter table public.tracks disable trigger tracks_set_updated_at;

delete from public.subgenres
where id in (select id from removed_subgenres);

-- After the delete: private.check_subgenre_name rejects a custom subgenre
-- named like a built-in one, which these names no longer are.
insert into public.subgenres (genre_id, user_id, name)
select distinct genre_id, user_id, name
from orphaned_tracks;

update public.tracks t
set subgenre_id = s.id
from orphaned_tracks o
join public.subgenres s
  on s.user_id = o.user_id and s.genre_id = o.genre_id and s.name = o.name
where t.id = o.track_id;

alter table public.tracks enable trigger tracks_set_updated_at;

drop table removed_subgenres, orphaned_tracks;
