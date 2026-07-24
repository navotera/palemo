package clientauth

import (
	"fmt"
	"strings"
)

type PGStrings []string

func (values *PGStrings) Scan(source any) error {
	if source == nil {
		*values = PGStrings{}
		return nil
	}
	var raw string
	switch value := source.(type) {
	case string:
		raw = value
	case []byte:
		raw = string(value)
	default:
		return fmt.Errorf("unsupported text array type %T", source)
	}
	raw = strings.TrimSpace(raw)
	if raw == "{}" || raw == "" {
		*values = PGStrings{}
		return nil
	}
	raw = strings.TrimPrefix(strings.TrimSuffix(raw, "}"), "{")
	parts := strings.Split(raw, ",")
	out := make(PGStrings, 0, len(parts))
	for _, part := range parts {
		out = append(out, strings.Trim(strings.TrimSpace(part), `"`))
	}
	*values = out
	return nil
}
