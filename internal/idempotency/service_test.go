package idempotency

import "testing"

func TestRequestHashIsStableAndPayloadSensitive(t *testing.T) {
	first := RequestHash([]byte(`{"name":"Project A"}`))
	second := RequestHash([]byte(`{"name":"Project A"}`))
	different := RequestHash([]byte(`{"name":"Project B"}`))
	if first != second {
		t.Fatal("identical payloads must produce identical hashes")
	}
	if first == different {
		t.Fatal("different payloads must produce different hashes")
	}
}
