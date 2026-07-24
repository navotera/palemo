package webhooks

import "testing"

func TestSignature(t *testing.T) {
	got := signature("secret", []byte("payload"))
	want := "sha256=b82fcb791acec57859b989b430a826488ce2e479fdf92326bd0a2e8375a42ba4"
	if got != want {
		t.Fatalf("got %s", got)
	}
}
