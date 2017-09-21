// external imports
import { createSelector } from "reselect"

// ivy imports
import { AppState } from "../app/types"
import { Template } from "../templates/types"

import {
  ContractParameterType,
  HashFunction,
  Input,
  InputMap
} from "../inputs/types"

import {
  addParameterInput,
  createSignature,
  getData,
  getPrivateKeyValue,
  getSequence,
  isValidInput
} from "../inputs/data"

import { fulfill, spend, toSighash } from "ivy-compiler"

// internal imports
import { Contract, ContractMap, ContractsState } from "./types"

import { SPEND_CONTRACT } from "./actions"

export const getState = (state: AppState): ContractsState => state.contracts

export const getContractIds = createSelector(
  getState,
  (state: ContractsState) => state.idList
)

export const getSpentContractIds = createSelector(
  getState,
  (state: ContractsState) => state.spentIdList
)

export const getContractMap = createSelector(
  getState,
  (state: ContractsState) => state.contractMap
)

export const getContract = (state: AppState, contractId: string) => {
  const contractMap = getContractMap(state)
  return contractMap[contractId]
}

export const getSpendContractId = createSelector(
  getState,
  (state: ContractsState): string => state.spendContractId
)

export const getSelectedClauseIndex = createSelector(
  getState,
  (state: ContractsState): number => {
    const selectedClauseIndex = state.selectedClauseIndex
    if (typeof selectedClauseIndex === "number") {
      return selectedClauseIndex
    } else {
      return parseInt(selectedClauseIndex, 10)
    }
  }
)

export const getShowUnlockInputErrors = createSelector(
  getState,
  (state: ContractsState): boolean => state.showUnlockInputErrors
)

export const getSpendContract = createSelector(
  getContractMap,
  getSpendContractId,
  (contractMap: ContractMap, contractId: string) => {
    const spendContract = contractMap[contractId]
    if (spendContract === undefined) {
      throw new Error("no contract for ID " + contractId)
    }
    return spendContract
  }
)

export const getInputSelector = (id: string) => {
  return createSelector(getInputMap, (inputMap: InputMap) => {
    const input = inputMap[id]
    if (input === undefined) {
      throw new Error("bad input ID: " + id)
    } else {
      return input
    }
  })
}

export const getSpendInputSelector = (id: string) => {
  return createSelector(getSpendInputMap, (spendInputMap: InputMap) => {
    const spendInput = spendInputMap[id]
    if (spendInput === undefined) {
      throw new Error("bad spend input ID: " + id)
    } else {
      return spendInput
    }
  })
}

export const getSpendInputMap = createSelector(
  getSpendContract,
  spendContract => spendContract.spendInputMap
)

export const getInputMap = createSelector(
  getSpendContract,
  spendContract => spendContract.inputMap
)

export const getParameterIds = createSelector(getSpendContract, spendContract =>
  spendContract.template.params.map(param => "contractParameters." + param.name)
)

export const getSelectedClause = createSelector(
  getSpendContract,
  getSelectedClauseIndex,
  (spendContract, clauseIndex) => {
    return spendContract.template.clauses[clauseIndex]
  }
)

export const getClauseName = createSelector(
  getSelectedClause,
  clause => clause.name
)

export const getClauseParameters = createSelector(
  getSelectedClause,
  clause => clause.parameters
)

export const getClauseParameterIds = createSelector(
  getClauseName,
  getClauseParameters,
  (clauseName, clauseParameters) => {
    return clauseParameters.map(
      param => "clauseParameters." + clauseName + "." + param.name
    )
  }
)

export const getInstantiated = createSelector(
  getSpendContract,
  contract => contract.instantiated
)

export const getSpendSourceTransaction = createSelector(
  getSpendContract,
  spendContract => spendContract.fundingTransaction
)

export const getSpendDestinationAddress = createSelector(
  getSpendInputMap,
  spendingInputsById => {
    return "" // getAddressValue(spendingInputsById)
  }
)

export const getSpendingLocktime = createSelector(
  getSpendInputMap,
  spendInputMap => {
    try {
      return getData("transactionDetails.lockTimeInput", spendInputMap)
    } catch (e) {
      console.log(e)
      return undefined
    }
  }
)

export const getSpendingSequenceNumber = createSelector(
  getSpendInputMap,
  spendInputMap => {
    try {
      const sequenceNumber = getSequence(spendInputMap)
      return sequenceNumber
    } catch (e) {
      console.log(e)
      return undefined
    }
  }
)

export const getSpendAmountInSatoshis = createSelector(
  getSpendContract,
  spendContract => spendContract.amount
)

export const getSpendTransaction = createSelector(
  getSpendSourceTransaction,
  getSpendDestinationAddress,
  getSpendAmountInSatoshis,
  getSpendingLocktime,
  getSpendingSequenceNumber,
  (
    spendSourceTransaction,
    spendDestinationAddress,
    amount,
    locktime,
    sequenceNumber
  ) => {
    if (locktime === undefined || sequenceNumber === undefined) {
      return undefined
    }
    return spend(
      spendSourceTransaction,
      spendDestinationAddress,
      amount,
      locktime as number,
      sequenceNumber
    )
  }
)

export const getSpendTransactionSigHash = createSelector(
  getInstantiated,
  getSpendTransaction,
  getSpendAmountInSatoshis,
  (instantiated, spendTransaction, spendAmount) =>
    toSighash(instantiated, spendTransaction, spendAmount)
)

export const getNumberOfClauses = createSelector(
  getSpendContract,
  spendContract => spendContract.template.clauses.length
)

export const getSpendClauseArgument = createSelector(
  getNumberOfClauses,
  getSelectedClauseIndex,
  (numberOfClauses, spendClauseIndex) => {
    if (numberOfClauses === 1) {
      return undefined
    } else {
      return spendClauseIndex
    }
  }
)

export const getSpendInputValues = createSelector(
  getClauseParameterIds,
  getSpendInputMap,
  getSpendClauseArgument,
  getSpendTransactionSigHash,
  (clauseParameterIds, spendInputMap, spendClauseArg, sigHash) => {
    try {
      const spendInputValues = clauseParameterIds.map(id =>
        getData(id, spendInputMap, sigHash)
      )
      if (!spendInputValues.every(el => el !== undefined)) {
        return undefined
      }
      return spendClauseArg !== undefined
        ? [spendClauseArg, ...spendInputValues]
        : spendInputValues
    } catch (e) {
      // console.log(e)
      return undefined
    }
  }
)

export const getSignatureData = (
  state,
  id: string,
  inputsById: { [s: string]: Input }
) => {
  const sigHash = getSpendTransactionSigHash(state)
  if (sigHash === undefined) {
    return undefined
  }
  const secret = getPrivateKeyValue(id, inputsById)
  const sig = createSignature(sigHash, secret)
  return sig ? sig.toString("hex") : undefined
}

export const getRedeemScript = createSelector(
  getSpendContract,
  spendContract => spendContract.redeemScript
)

export const getWitnessScript = createSelector(
  getSpendContract,
  spendContract => spendContract.witnessScript
)

export const getScriptSig = createSelector(
  getSpendContract,
  spendContract => spendContract.scriptSig
)

export const getFulfilledSpendTransaction = createSelector(
  getInstantiated,
  getSpendTransaction,
  getSpendInputValues,
  (instantiated, unfulfilledSpendTransaction, witnessArgs) => {
    if (
      instantiated === undefined ||
      unfulfilledSpendTransaction === undefined ||
      witnessArgs === undefined
    ) {
      return undefined
    }
    const spendTransaction = fulfill(
      instantiated,
      unfulfilledSpendTransaction,
      witnessArgs
    )
    return spendTransaction
  }
)

export function getSpendInput(state, id: string) {
  const spendInputsById = getSpendInputMap(state)
  const spendInput = spendInputsById[id]
  if (spendInput === undefined) {
    throw new Error("bad spend input ID: " + id)
  } else {
    return spendInput
  }
}

export const getResult = createSelector(
  getSpendInputValues,
  getFulfilledSpendTransaction,
  getSpendingLocktime,
  getSpendingSequenceNumber,
  (spendInputValues, tx, lockTime, sequenceNumber) => {
    if (
      spendInputValues === undefined ||
      lockTime === undefined ||
      sequenceNumber === undefined
    ) {
      return {
        success: false,
        style: "warning",
        message: "The provided inputs are invalid."
      }
    }
    if (tx === undefined) {
      return {
        success: false,
        style: "warning",
        message: "The spending transaction is invalid."
      }
    }
    const enabled = false
    try {
      tx.check()
    } catch (e) {
      console.log(e)
      return {
        success: false,
        style: "danger",
        message:
          "The provided inputs do not satisfy the contract (" + e.code + ")."
      }
    }
    return { success: true }
  }
)

export const areSpendInputsValid = createSelector(
  getSpendInputMap,
  getClauseParameterIds,
  getSpendTransactionSigHash,
  (spendInputMap, parameterIds, sigHash) => {
    try {
      parameterIds.filter(id => {
        getData(id, spendInputMap, sigHash)
      })
      return true
    } catch (e) {
      // console.log(e)
      return false
    }
  }
)

export const getError = createSelector(getState, state => state.error)

export const generateInputMap = (compiled: Template): InputMap => {
  const inputs: Input[] = []
  for (const param of compiled.params) {
    addParameterInput(
      inputs,
      param.valueType,
      "contractParameters." + param.name
    )
  }

  const inputMap = {}
  for (const input of inputs) {
    inputMap[input.name] = input
  }
  return inputMap
}
