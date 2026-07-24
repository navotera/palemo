package database

import (
	"reflect"
	"testing"
)

func TestBindPostgresPreservesRepeatedAndOutOfOrderParameters(t *testing.T) {
	query, args := bindPostgres("tenant_id=$1 AND id=$2 OR owner_id=$1", []any{"tenant", "resource"})
	if query != "tenant_id=? AND id=? OR owner_id=?" {
		t.Fatalf("unexpected normalized query: %s", query)
	}
	want := []any{"tenant", "resource", "tenant"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("unexpected bound args: %#v", args)
	}
}

func TestBindPostgresLeavesInvalidParameterUntouched(t *testing.T) {
	query, args := bindPostgres("tenant_id=$2", []any{"tenant"})
	if query != "tenant_id=$2" || len(args) != 0 {
		t.Fatalf("unexpected invalid parameter handling: %s %#v", query, args)
	}
}
