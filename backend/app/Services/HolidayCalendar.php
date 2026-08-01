<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

class HolidayCalendar
{
    public function countryCode(string $tenantId): string
    {
        $country = strtoupper((string) (DB::table('tenant_settings')
            ->where('tenant_id', $tenantId)
            ->value('country_code') ?? 'ID'));

        return preg_match('/^[A-Z]{2}$/', $country) ? $country : 'ID';
    }

    /** @return array<int, array{date:string,name:string,local_name:string}> */
    public function holidays(string $tenantId, int $year): array
    {
        $country = $this->countryCode($tenantId);
        $cacheKey = "holidays:{$country}:{$year}";
        $staleKey = "holidays:stale:{$country}:{$year}";

        try {
            return Cache::remember($cacheKey, now()->addDays(30), function () use ($country, $year, $staleKey) {
                $response = Http::acceptJson()
                    ->timeout(5)
                    ->retry(2, 200)
                    ->get("https://date.nager.at/api/v3/publicholidays/{$year}/{$country}");
                $response->throw();
                $items = collect($response->json())
                    ->filter(fn ($item) => is_array($item) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) ($item['date'] ?? '')))
                    ->map(fn ($item) => [
                        'date' => (string) $item['date'],
                        'name' => mb_substr((string) ($item['name'] ?? 'Public holiday'), 0, 160),
                        'local_name' => mb_substr((string) ($item['localName'] ?? $item['name'] ?? 'Public holiday'), 0, 160),
                    ])->values()->all();
                Cache::put($staleKey, $items, now()->addYear());
                return $items;
            });
        } catch (\Throwable) {
            return Cache::get($staleKey, []);
        }
    }

    public function isHoliday(string $tenantId, string $date): bool
    {
        $year = (int) substr($date, 0, 4);
        return collect($this->holidays($tenantId, $year))->contains('date', $date);
    }
}
