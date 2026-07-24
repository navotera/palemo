package clientauth

import "testing"

func TestPGStringsScan(t *testing.T) {
	var values PGStrings
	if err := values.Scan("{projects:read,projects:write}"); err != nil {
		t.Fatal(err)
	}
	if len(values) != 2 || values[1] != "projects:write" {
		t.Fatalf("unexpected values: %#v", values)
	}
}
