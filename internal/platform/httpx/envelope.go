package httpx

import (
	"encoding/json"
	"net/http"
)

type Error struct {
	Code    string `json:"code"`
	Field   string `json:"field,omitempty"`
	Message string `json:"message"`
}

type Meta struct {
	RequestID string `json:"request_id"`
}

type Envelope struct {
	Data   any     `json:"data"`
	Meta   Meta    `json:"meta"`
	Errors []Error `json:"errors"`
}

func Write(w http.ResponseWriter, r *http.Request, status int, data any) {
	writeJSON(w, status, Envelope{Data: data, Meta: Meta{RequestID: RequestID(r.Context())}, Errors: nil})
}

func WriteError(w http.ResponseWriter, r *http.Request, status int, errs ...Error) {
	writeJSON(w, status, Envelope{Data: nil, Meta: Meta{RequestID: RequestID(r.Context())}, Errors: errs})
}

func writeJSON(w http.ResponseWriter, status int, payload Envelope) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
