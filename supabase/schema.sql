-- Password-only gateway: apply in Supabase SQL Editor before deploying the update.
-- Keeps the existing preparation and revision intact; retires all email access.
begin;
create table if not exists public.preparations (
  id text primary key check (id = 'natal2026'),
  payload jsonb not null,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
alter table public.preparations enable row level security;
revoke all on public.preparations from public, anon, authenticated;
grant select on public.preparations to service_role;
drop policy if exists team_read on public.preparations;
-- Remove access to the old email RPCs without touching the preparation or Auth users.
do $$ begin
  if to_regprocedure('public.save_preparation(bigint,jsonb)') is not null then
    execute 'revoke all on function public.save_preparation(bigint,jsonb) from public, anon, authenticated';
  end if;
  if to_regprocedure('public.is_team_member()') is not null then
    execute 'revoke all on function public.is_team_member() from public, anon, authenticated';
  end if;
end $$;

create or replace function public.save_preparation_server(p_revision bigint, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare next_revision bigint;
begin
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
      updated_at = now(), updated_by = null
    where id = 'natal2026' and preparations.revision = p_revision
    returning preparations.revision into next_revision;
  if not found then
    raise sqlstate 'PT409' using message = 'The team has saved a newer revision';
  end if;
  return jsonb_build_object('revision', next_revision);
end;
$$;
revoke all on function public.save_preparation_server(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.save_preparation_server(bigint, jsonb) to service_role;

create table if not exists public.login_attempts (
  fingerprint text primary key,
  window_start timestamptz not null,
  attempts integer not null
);
alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from public, anon, authenticated;
create or replace function public.check_login_limit(p_fingerprint text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare total integer;
begin
  if p_fingerprint is null or p_fingerprint !~ '^[a-f0-9]{64}$' then
    raise invalid_parameter_value using message = 'Invalid fingerprint';
  end if;
  delete from public.login_attempts where window_start < now() - interval '1 day';
  insert into public.login_attempts as a (fingerprint, window_start, attempts)
    values (p_fingerprint, now(), 1)
  on conflict (fingerprint) do update set
    window_start = case when a.window_start < now() - interval '15 minutes' then now() else a.window_start end,
    attempts = case when a.window_start < now() - interval '15 minutes' then 1 else least(a.attempts + 1, 1000000) end
  returning attempts into total;
  return total <= 20;
end;
$$;
revoke all on function public.check_login_limit(text) from public, anon, authenticated;
grant execute on function public.check_login_limit(text) to service_role;
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
