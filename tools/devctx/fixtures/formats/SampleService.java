package com.example.service;

import java.util.UUID;

public class SampleService {
  public UUID createUser(String email) {
    return UUID.randomUUID();
  }
}
