package api

import (
  "context"
  "net/http"
)

type Server struct {}

type Handler interface {
  ServeHTTP(http.ResponseWriter, *http.Request)
}

func BuildServer() *Server {
  return &Server{}
}

func (s *Server) Handle(ctx context.Context) error {
  return nil
}
