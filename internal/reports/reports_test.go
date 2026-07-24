package reports

import (
	"bytes"
	"testing"
)

func TestSimplePDFProducesValidEnvelope(t *testing.T) {
	document := SimplePDF(Report{From: "2026-07-01", To: "2026-07-31", Rows: []Row{{Name: "Ada", CompletedTasks: 4, OpenTasks: 2, DurationSeconds: 7200}}, Totals: Row{Name: "Total", CompletedTasks: 4, OpenTasks: 2, DurationSeconds: 7200}})
	if !bytes.HasPrefix(document, []byte("%PDF-1.4")) || !bytes.HasSuffix(document, []byte("%%EOF")) {
		t.Fatalf("invalid PDF envelope")
	}
	for _, expected := range [][]byte{[]byte("NPMS Productivity Report"), []byte("Ada"), []byte("2.00")} {
		if !bytes.Contains(document, expected) {
			t.Fatalf("missing %q", expected)
		}
	}
}
