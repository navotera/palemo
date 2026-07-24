# Module Spec — Auth & SSO

## Status: Approved | Fase: 0

## Tujuan
User management NPMS terintegrasi dengan sistem aplikasi milik user sendiri (bukan
membangun user management terpisah dari nol), melalui SSO berbasis API.

## Model
- NPMS **tidak** menjadi Identity Provider (IdP). NPMS menjadi **Service Provider (SP)**
  yang memvalidasi token/identitas dari sistem eksternal milik user.
- Dua opsi teknis (pilih salah satu, dikonfirmasi dengan user sebelum implementasi):
  1. **Token Introspection**: NPMS memanggil endpoint milik sistem eksternal
     (`POST /validate-token`) setiap kali menerima token dari user, mendapat balik
     `{user_id, name, email, role}`.
  2. **JWT Shared Secret**: sistem eksternal menandatangani JWT dengan secret yang
     disepakati bersama; NPMS cukup verifikasi signature secara lokal tanpa round-trip
     API (lebih cepat, tapi butuh rotasi secret yang aman).

Rekomendasi: opsi 2 (JWT shared secret) untuk performa, dengan fallback opsi 1 jika
sistem eksternal perlu mencabut akses user secara real-time (revocation).

## Entity
`users.external_id` menyimpan ID user di sistem eksternal (lihat `01-domain-model.md
§2.4`). NPMS tidak menyimpan password sama sekali.

## Alur Login
```
User login di aplikasi utama milik user (di luar NPMS)
        ↓
Aplikasi utama redirect ke NPMS dengan JWT (berisi external_id, name, email, role)
        ↓
NPMS verifikasi signature JWT
        ↓
Jika external_id belum ada di `users` → auto-provision user baru (JIT provisioning)
        ↓
NPMS set session/cookie untuk dashboard NPMS
```

## Acceptance Criteria
1. Tidak ada form "buat password" di NPMS — seluruh identitas berasal dari sistem
   eksternal.
2. Role mapping (`admin`, `manager`, `supervisor`, `staff`) dari sistem eksternal
   ke role NPMS didefinisikan secara eksplisit dan bisa dikonfigurasi ulang tanpa
   deploy kode (mis. tabel mapping, bukan hardcoded).
3. JWT kadaluarsa dihormati — sesi NPMS tidak boleh bertahan lebih lama dari validitas
   token asal.

## Ecopa hybrid mode (2026-07-24)

Palemo must support Ecopa as an external Identity Provider while retaining Palemo local login as an administrator-controlled fallback. Supported tenant modes are local, ecopa_sso, and hybrid. Hybrid is the safe rollout default: present Ecopa SSO first and keep local login available.

- Use OIDC Authorization Code with PKCE when Ecopa exposes standards-based SSO; never accept identity claims from an unsigned browser payload.
- Validate issuer, audience, signature, expiry, nonce, state, and redirect URI. JIT provisioning maps Ecopa sub to users.external_id within the tenant.
- Client secrets and signing material are encrypted at rest, write-only in APIs, masked in UI, and excluded from logs/audit payloads.
- Role mapping is tenant-configurable and defaults to least privilege. Ecopa logout may end the federated session; Palemo logout must always clear the local session.
- Local fallback can only be disabled after a successful Ecopa connection test and at least one mapped Ecopa administrator, preventing tenant lockout.
- SSO callbacks, login attempts, provisioning, role changes, failures, and fallback use are audited without tokens or secrets.
- The login screen must discover tenant authentication settings server-side and show Continue with Ecopa plus local login only when permitted.
