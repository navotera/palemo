package httpx

import (
	"encoding/json"
	"net/http"
)

func MarshalResponse(r *http.Request, data any) ([]byte, error) {
	return json.Marshal(Envelope{Data: data, Meta: Meta{RequestID: RequestID(r.Context())}, Errors: nil})
}

func WriteRawJSON(w http.ResponseWriter, status int, body []byte) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(body)
}
