terraform {
  required_version = ">= 1.6.0"
}

provider "aws" {
  region = "eu-west-1"
}

variable "workspace_name" {
  type = string
}

resource "aws_s3_bucket" "logs" {
  bucket = "logs-example"
}
