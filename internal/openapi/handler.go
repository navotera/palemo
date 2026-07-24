package openapi

import (
	_ "embed"
	"net/http"

	"github.com/gin-gonic/gin"
)

//go:embed openapi.yaml
var specification []byte

func Handler(c *gin.Context) {
	c.Header("Content-Type", "application/yaml; charset=utf-8")
	c.Data(http.StatusOK, "application/yaml; charset=utf-8", specification)
}
