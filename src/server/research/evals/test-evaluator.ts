import { evaluateAIOutput } from "./evaluator";

function runTests() {
  console.log("=== Running AI Evaluator Tests ===");

  const passInput = {
    targetSymbol: "005930",
    generatedContent: "삼성전자의 HBM 양산 기대감으로 외국인 매수세 유입. 투자 판단은 본인에게 있습니다.",
    sources: [
      { title: "삼성전자 HBM", provider: "KIS", collectedAt: new Date().toISOString(), symbol: "005930" },
      { title: "삼전 외인 순매수", provider: "DART", collectedAt: new Date().toISOString(), symbol: "005930" }
    ],
    requireDisclaimer: true
  };

  const passRes = evaluateAIOutput(passInput);
  console.assert(passRes.passed === true, "Test 1 Failed: Should pass valid input.");

  const failInput1 = { ...passInput, generatedContent: "삼성전자 당장 매수 추천합니다." };
  const failRes1 = evaluateAIOutput(failInput1);
  console.assert(failRes1.passed === false, "Test 2 Failed: Should fail on imperative language.");
  
  const failInput2 = { ...passInput, requireDisclaimer: true, generatedContent: "그냥 좋은 소식입니다." };
  const failRes2 = evaluateAIOutput(failInput2);
  console.assert(failRes2.passed === false, "Test 3 Failed: Should fail on missing disclaimer.");

  const failInput3 = { ...passInput, sources: [{ title: "단일 소스", provider: "gnews", collectedAt: new Date().toISOString() }] };
  const failRes3 = evaluateAIOutput(failInput3);
  console.assert(failRes3.passed === false, "Test 4 Failed: Should fail on insufficient sources.");

  console.log("Evaluation tests completed successfully.");
}

runTests();
