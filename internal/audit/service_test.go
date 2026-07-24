package audit

import (
	"encoding/json"
	"testing"
)

func TestMarshalNullablePreservesMutationState(t *testing.T) {
	state := map[string]any{"status": "active", "position": float64(3)}
	payload, err := marshalNullable(state)
	if err != nil {
		t.Fatalf("marshal state: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("decode state: %v", err)
	}
	if decoded["status"] != "active" || decoded["position"] != float64(3) {
		t.Fatalf("mutation state changed during serialization: %#v", decoded)
	}
}

func TestMarshalNullableKeepsAbsentStateSQLNull(t *testing.T) {
	payload, err := marshalNullable(nil)
	if err != nil {
		t.Fatalf("marshal nil state: %v", err)
	}
	if payload != nil {
		t.Fatalf("expected nil SQL value, got %q", payload)
	}
}
