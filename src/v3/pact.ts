import logger from "../common/logger"
const PactNative = require("../native")

export interface PactV3Options {
  dir: string
  consumer: string
  provider: string
}

export interface V3ProviderState {
  description: string
  parameters?: any
}

export interface V3Request {
  method: string
  path: string
  query?: {
    [param: string]: string
  }
  headers?: {
    [header: string]: string
  }
  body?: any
}

export interface V3Response {
  status: number
  headers?: {
    [header: string]: string
  }
  body?: any
}

export interface V3MockServer {
  port: number
  url: string
  id: string
}

export class PactV3 {
  private opts: any
  private states: V3ProviderState[] = []
  private pact: any

  constructor(opts: PactV3Options & {}) {
    this.opts = opts
    this.pact = new PactNative.Pact(opts.consumer, opts.provider)
  }

  public given(providerState: string, parameters?: any) {
    this.states.push({ description: providerState, parameters })
    return this
  }

  public uponReceiving(desc: string) {
    this.pact.addInteraction(desc, this.states)
    return this
  }

  public withRequest(req: V3Request) {
    this.pact.addRequest(req, req.body && JSON.stringify(req.body))
    return this
  }

  public withRequestBinaryFile(
    req: V3Request,
    contentType: string,
    file: string
  ) {
    this.pact.addRequestBinaryFile(req, contentType, file)
    return this
  }

  public withRequestMultipartFileUpload(
    req: V3Request,
    contentType: string,
    file: string,
    part: string
  ) {
    this.pact.addRequestMultipartFileUpload(req, contentType, file, part)
    return this
  }

  public willRespondWith(res: V3Response) {
    this.pact.addResponse(res, res.body && JSON.stringify(res.body))
    this.states = []
    return this
  }

  public withResponseBinaryFile(
    res: V3Response,
    contentType: string,
    file: string
  ) {
    this.pact.addResponseBinaryFile(res, contentType, file)
    return this
  }

  public withResponseMultipartFileUpload(
    req: V3Response,
    contentType: string,
    file: string,
    part: string
  ) {
    this.pact.addResponseMultipartFileUpload(req, contentType, file, part)
    return this
  }

  public executeTest<T>(
    testFn: (mockServer: V3MockServer) => Promise<T>
  ): Promise<T> {
    const result = this.pact.executeTest(testFn)
    if (result.testResult) {
      return result.testResult
        .then((val: T) => {
          const testResult = this.pact.getTestResult(result.mockServer.id)
          if (testResult.mockServerError) {
            return Promise.reject(new Error(testResult.mockServerError))
          } else if (testResult.mockServerMismatches) {
            let error = "Mock server failed with the following mismatches: "
            for (const mismatch of testResult.mockServerMismatches) {
              error += "\n\t" + mismatch
            }
            return Promise.reject(new Error(error))
          } else {
            this.pact.writePactFile(result.mockServer.id, this.opts.dir)
            return val
          }
        })
        .catch((err: any) => {
          const testResult = this.pact.getTestResult(result.mockServer.id)
          let error = "Test failed for the following reasons:"
          error += "\n\n\tTest code failed with an error: " + err.message
          if (testResult.mockServerError) {
            error += "\n\n\t" + testResult.mockServerError
          }
          if (testResult.mockServerMismatches) {
            error += "\n\n\tMock server failed with the following mismatches: "
            let i = 1
            for (const mismatchJson of testResult.mockServerMismatches) {
              let mismatches = JSON.parse(mismatchJson)
              if (mismatches.mismatches) {
                for (const mismatch of mismatches.mismatches) {
                  error += `\n\t\t${i++}) ${mismatch.type} ${
                    mismatch.path ? `(at ${mismatch.path}) ` : ""
                  }${mismatch.mismatch}`
                }
              }
            }
          }
          return Promise.reject(new Error(error))
        })
        .finally(() => {
          this.pact.shutdownTest(result)
        })
    } else {
      this.pact.shutdownTest(result)
      return Promise.reject(result.testError)
    }
  }
}