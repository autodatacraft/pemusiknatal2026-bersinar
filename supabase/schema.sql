-- Run once in Supabase SQL Editor. Reruns preserve the shared preparation.
begin;
create table if not exists public.team_members (
  email text primary key check (email = lower(email))
);
alter table public.team_members enable row level security;
revoke all on public.team_members from anon, authenticated;

create table if not exists public.preparations (
  id text primary key check (id = 'natal2026'),
  payload jsonb not null,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.preparations enable row level security;
revoke all on public.preparations from anon, authenticated;
grant select on public.preparations to authenticated;

create or replace function public.is_team_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.team_members
    where email = lower(auth.jwt()->>'email')
  );
$$;
revoke all on function public.is_team_member() from public, anon;
grant execute on function public.is_team_member() to authenticated;

drop policy if exists team_read on public.preparations;
create policy team_read on public.preparations for select to authenticated
using ((select public.is_team_member()));

create or replace function public.save_preparation(p_revision bigint, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare next_revision bigint;
begin
  if not public.is_team_member() then
    raise insufficient_privilege using message = 'Team membership required';
  end if;
  if p_revision is null or p_payload is null or jsonb_typeof(p_payload) <> 'object'
    or (p_payload->>'version') is distinct from '1'
    or jsonb_typeof(p_payload->'songs') is distinct from 'array'
    or octet_length(p_payload::text) > 500000 then
    raise invalid_parameter_value using message = 'Invalid preparation payload';
  end if;
  if jsonb_array_length(p_payload->'songs') <> 5
    or jsonb_typeof(p_payload->'decisions') is distinct from 'array'
    or jsonb_typeof(p_payload->'open') is distinct from 'array' then
    raise invalid_parameter_value using message = 'Invalid preparation structure';
  end if;
  update public.preparations
    set payload = p_payload, revision = preparations.revision + 1,
      updated_at = now(), updated_by = auth.uid()
    where id = 'natal2026' and preparations.revision = p_revision
    returning preparations.revision into next_revision;
  if not found then
    raise sqlstate 'PT409' using message = 'The team has saved a newer revision';
  end if;
  return jsonb_build_object('revision', next_revision);
end;
$$;
revoke all on function public.save_preparation(bigint, jsonb) from public, anon;
grant execute on function public.save_preparation(bigint, jsonb) to authenticated;

-- Coordinator access; add teammates explicitly in Supabase SQL Editor.
insert into public.team_members(email) values ('autodatacraft@gmail.com') on conflict do nothing;

insert into public.preparations(id,payload) values ('natal2026', $seed${
  "version": 1,
  "songs": [
    {
      "id": "kota",
      "title": "Hai Kota Mungil",
      "moment": "Pembukaan",
      "guide": "Perkenalkan melodi yang belum terlalu dikenal. Piano memainkan melodi utama secara jelas sebelum jemaat mulai bernyanyi.",
      "brief": "Kenalkan melodi, undang jemaat bernyanyi bersama.",
      "intro": "Piano memainkan melodi utama satu putaran agar jemaat mengenali lagu.",
      "outro": "Tutup dengan tenang; beri ruang untuk aba-aba pemimpin pujian.",
      "transition": "Sepakati aba-aba masuk medley bersama pemimpin pujian.",
      "roles": [
        {
          "name": "",
          "text": "Mainkan melodi dengan jelas, lalu iringi vokal dengan ringan."
        },
        {
          "name": "",
          "text": "Masuk lembut setelah melodi diperkenalkan."
        },
        {
          "name": "",
          "text": "Petikan atau strum ringan untuk menopang jemaat."
        },
        {
          "name": "",
          "text": "Nada akar sederhana; jaga fondasi tanpa menutup melodi."
        }
      ],
      "key": "",
      "tempo": "",
      "checks": [
        false,
        false,
        false,
        false,
        false
      ],
      "notes": ""
    },
    {
      "id": "medley",
      "title": "Hai Siarkan + Dari Pulau dan Benua",
      "moment": "Pujian · Medley",
      "guide": "Gunakan drum dan bass untuk membangun energi medley. Latih sambungan dua lagu, cue drum, dan titik masuk vokal.",
      "brief": "Penuh sukacita, bertumbuh dalam satu aliran pujian.",
      "intro": "Usulan: count-in drum, lalu seluruh band masuk dengan motif yang jelas.",
      "outro": "Akhiri medley bersama dengan cue pemimpin musik.",
      "transition": "Titik sambung Hai Siarkan → Dari Pulau dan Benua serta modulasi belum ditentukan.",
      "roles": [
        {
          "name": "",
          "text": "Jaga harmoni dan cue pergantian lagu."
        },
        {
          "name": "",
          "text": "Bangun energi; berikan fill sebagai cue sambungan."
        },
        {
          "name": "",
          "text": "Strum ritmis untuk menguatkan gerak pujian."
        },
        {
          "name": "",
          "text": "Kunci groove bersama kick drum; dorong energi medley."
        }
      ],
      "key": "",
      "tempo": "",
      "checks": [
        false,
        false,
        false,
        false,
        false
      ],
      "notes": ""
    },
    {
      "id": "berhimpun",
      "title": "Hai Mari Berhimpun",
      "moment": "Kolekte",
      "guide": "Buat aransemen megah tetapi mudah dinyanyikan. Utamakan register vokal jemaat dan harmoni yang jelas.",
      "brief": "Megah dan hangat, tetap mudah diikuti jemaat.",
      "intro": "Piano / keyboard membuka dengan harmoni megah dan tempo yang jelas.",
      "outro": "Tahan akor akhir secukupnya, lalu turunkan dinamika.",
      "transition": "Turunkan dinamika menuju suasana firman; tunggu cue liturgis.",
      "roles": [
        {
          "name": "",
          "text": "Piano dan pad mendukung kemegahan tanpa menutup vokal."
        },
        {
          "name": "",
          "text": "Groove stabil; hindari fill berlebihan."
        },
        {
          "name": "",
          "text": "Strum akor terbuka dengan ruang bagi jemaat."
        },
        {
          "name": "",
          "text": "Fondasi yang kokoh dan gerakan akor yang jelas."
        }
      ],
      "key": "",
      "tempo": "",
      "checks": [
        false,
        false,
        false,
        false,
        false
      ],
      "notes": ""
    },
    {
      "id": "daku",
      "title": "Yesus Menginginkan Daku",
      "moment": "Firman",
      "guide": "Jaga sederhana dan reflektif. Beri ruang untuk syair, doa, dan keheningan.",
      "brief": "Sederhana, reflektif, memberi ruang bagi firman.",
      "intro": "Piano lembut dengan motif sederhana; beri ruang sebelum vokal.",
      "outro": "Akhiri lembut dan biarkan akor menghilang secara alami.",
      "transition": "Sediakan ruang hening dan ikuti arahan pelayan firman.",
      "roles": [
        {
          "name": "",
          "text": "Iringan piano sederhana dan lembut."
        },
        {
          "name": "",
          "text": "Minimal; tentukan bagian tanpa drum saat latihan."
        },
        {
          "name": "",
          "text": "Petikan jarang, mengikuti napas vokal."
        },
        {
          "name": "",
          "text": "Nada panjang seperlunya, dinamika sangat lembut."
        }
      ],
      "key": "",
      "tempo": "",
      "checks": [
        false,
        false,
        false,
        false,
        false
      ],
      "notes": ""
    },
    {
      "id": "holy",
      "title": "O Holy Night",
      "moment": "Penyalaan lilin",
      "guide": "Mulai dengan piano saja, lalu bangun bertahap. Sepakati titik masuk setiap instrumen dan puncak dinamika.",
      "brief": "Dari piano yang intim menuju puncak yang agung.",
      "intro": "Piano saja. Instrumen lain menunggu cue masuk yang disepakati.",
      "outro": "Turunkan kembali ke piano dan akor akhir yang tenang.",
      "transition": "Selaraskan awal lagu dengan aba-aba penyalaan lilin.",
      "roles": [
        {
          "name": "",
          "text": "Mulai solo piano; bangun voicing dan dinamika bertahap."
        },
        {
          "name": "",
          "text": "Masuk belakangan dengan lembut; bangun menuju klimaks."
        },
        {
          "name": "",
          "text": "Masuk setelah pembukaan piano; tambah tekstur secara bertahap."
        },
        {
          "name": "",
          "text": "Masuk bertahap bersama pembangunan dinamika."
        }
      ],
      "key": "",
      "tempo": "",
      "checks": [
        false,
        false,
        false,
        false,
        false
      ],
      "notes": ""
    }
  ],
  "decisions": [],
  "open": [
    {
      "id": "o1",
      "text": "Nada dasar & tempo seluruh lagu",
      "done": false
    },
    {
      "id": "o2",
      "text": "Titik sambung dan modulasi medley",
      "done": false
    },
    {
      "id": "o3",
      "text": "Cue masuk instrumen untuk O Holy Night",
      "done": false
    },
    {
      "id": "o4",
      "text": "Penanggung jawab setiap instrumen",
      "done": false
    },
    {
      "id": "o5",
      "text": "Tanggal latihan & gladi bersih",
      "done": false
    }
  ]
}
$seed$::jsonb) on conflict (id) do nothing;
commit;
