package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestMain(m *testing.M) {
	gin.SetMode(gin.TestMode)
	m.Run()
}

func newLogoutEngine() *gin.Engine {
	engine := gin.New()
	api := AuthAPI{}
	engine.POST("/api/v1/logout", api.LogoutHandler)
	return engine
}

func Test_LogoutHandler_Should_Clear_Refresh_Cookie_And_Return_204(t *testing.T) {
	engine := newLogoutEngine()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/logout", nil)
	req.AddCookie(&http.Cookie{Name: "refreshToken", Value: "some-token"})
	w := httptest.NewRecorder()

	engine.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNoContent, w.Code)

	setCookie := w.Header().Get("Set-Cookie")
	assert.True(t, strings.HasPrefix(setCookie, "refreshToken="),
		"expected Set-Cookie to clear refreshToken, got %q", setCookie)
	assert.Contains(t, setCookie, "Max-Age=0",
		"expected Max-Age=0 to invalidate cookie, got %q", setCookie)
	assert.Contains(t, setCookie, "Path=/")
	assert.Contains(t, setCookie, "HttpOnly")
}

func Test_LogoutHandler_Without_Cookie_Should_Still_Return_204(t *testing.T) {
	engine := newLogoutEngine()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/logout", nil)
	w := httptest.NewRecorder()

	engine.ServeHTTP(w, req)

	assert.Equal(t, http.StatusNoContent, w.Code)
	setCookie := w.Header().Get("Set-Cookie")
	assert.Contains(t, setCookie, "refreshToken=")
	assert.Contains(t, setCookie, "Max-Age=0")
}
