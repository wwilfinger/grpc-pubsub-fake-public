package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"
	"time"

	"crypto/tls"

	pubsubpb "github.com/wwilfinger/grpc-golang-pubsub-fake/protos/google/pubsub/v1"

	"github.com/kelseyhightower/envconfig"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
	"google.golang.org/grpc/keepalive"
)

type Config struct {
	Port              int           `default:"50051"`
	ConnectionTimeout time.Duration `split_words:"true" default:"1ms"`
	ServerCert        string        `split_words:"true" default:"./../cert/server-cert.pem"`
	ServerKey         string        `split_words:"true" default:"./../cert/server-key.pem"`
}

type PublisherServer struct {
	pubsubpb.UnimplementedPublisherServer
}

func (s *PublisherServer) Publish(context.Context, *pubsubpb.PublishRequest) (*pubsubpb.PublishResponse, error) {
	log.Printf("recv Publish\n")
	return &pubsubpb.PublishResponse{
		MessageIds: []string{"a unique message id"},
	}, nil
}

func mainErr() error {
	fmt.Println("Go gRPC server")

	var config Config
	err := envconfig.Process("app", &config)
	if err != nil {
		return err
	}

	log.Printf("ConnectionTimeout: %v", config.ConnectionTimeout)

	addr := fmt.Sprintf(":%d", config.Port)

	// Load certs from the disk.
	cert, err := tls.LoadX509KeyPair(config.ServerCert, config.ServerKey)
	if err != nil {
		return fmt.Errorf("could not server key pairs: %s", err)
	}

	// Create the TLS config for gRPC server.
	creds := credentials.NewTLS(
		&tls.Config{
			Certificates: []tls.Certificate{cert},
		})

	lis, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("Failed to listen on %s: %v", addr, err)
	} else {
		log.Printf("Listening on %v\n", lis.Addr())
	}

	publisherServer := PublisherServer{}
	grpcServer := grpc.NewServer(
		grpc.Creds(creds),
		grpc.ConnectionTimeout(config.ConnectionTimeout),
		grpc.InitialConnWindowSize(1024*1024),
		grpc.KeepaliveParams(
			keepalive.ServerParameters{
				MaxConnectionAge:      10 * time.Second,
				MaxConnectionAgeGrace: 5 * time.Second,
			},
		),
	)
	pubsubpb.RegisterPublisherServer(grpcServer, &publisherServer)

	if err := grpcServer.Serve(lis); err != nil {
		return fmt.Errorf("Failed to serve gRPC server over %s: %v", addr, err)
	}

	return nil
}

func main() {
	if err := mainErr(); err != nil {
		fmt.Fprintf(os.Stderr, "%v", err)
		os.Exit(-1)
	}
}
