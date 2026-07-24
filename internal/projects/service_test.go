package projects

import (
	"github.com/google/uuid"
	"testing"
)

func TestUniqueIDsDeduplicatesAndIgnoresNil(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	got := uniqueIDs([]uuid.UUID{a, uuid.Nil, a, b})
	if len(got) != 2 || got[0] != a || got[1] != b {
		t.Fatalf("unexpected IDs: %v", got)
	}
}

func TestNormalizeChecklistTrimsAndDropsEmptyItems(t *testing.T) {
	got := normalizeChecklist([]string{"  Discovery ", "", "   ", "Approval"})
	if len(got) != 2 || got[0] != "Discovery" || got[1] != "Approval" {
		t.Fatalf("unexpected checklist: %v", got)
	}
}

func TestNormalizeTagsDeduplicatesCaseInsensitively(t *testing.T) {
	got, err := normalizeTags([]string{" Priority ", "priority", "", "Launch"})
	if err != nil || len(got) != 2 || got[0] != "Priority" || got[1] != "Launch" {
		t.Fatalf("unexpected tags: %v, error: %v", got, err)
	}
}
