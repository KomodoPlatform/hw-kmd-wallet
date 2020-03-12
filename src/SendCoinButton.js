import React from 'react';
import ActionListModal from './ActionListModal';
import TxidLink from './TxidLink';
import ledger from './lib/ledger';
import blockchain from './lib/blockchain';
import getAddress from './lib/get-address';
import checkPublicAddress from './lib/validate-address';
import updateActionState from './lib/update-action-state';
import humanReadableSatoshis from './lib/human-readable-satoshis';
import {TX_FEE, coin, KOMODO} from './constants';

import {transactionBuilder} from './lib/utils';
import {toSats, fromSats} from './lib/utils';

class SendCoinButton extends React.Component {
  state = this.initialState;

  get initialState() {
    this.setSkipBroadcast = this.setSkipBroadcast.bind(this);

    return {
      isDebug: window.location.href.indexOf('#enable-verify') > -1,
      isClaimingRewards: false,
      error: false,
      success: false,
      actions: {
        connect: {
          icon: 'fab fa-usb',
          description: this.props.vendor === 'ledger' ? <div>Connect and unlock your Ledger, then open the Komodo app on your device.</div> : <div>Connect and unlock your Trezor.</div>,
          state: null
        },
        confirmAddress: {
          icon: 'fas fa-search-dollar',
          description: <div>Confirm the address on your device matches the new unused address shown above.</div>,
          state: null
        },
        approveTransaction: {
          icon: 'fas fa-key',
          description: <div>Approve the transaction on your device after carefully checking the values and addresses match those shown above.</div>,
          state: null
        },
        broadcastTransaction: {
          icon: 'fas fa-broadcast-tower',
          description: <div>Broadcasting the reward claim transaction to the network.</div>,
          state: null
        },
      },
      skipBroadcast: false,
      skipBroadcastClicked: false,
      amount: 0,
      sendTo: null,
      change: 0,
      changeTo: null,
    };
  }

  setSkipBroadcast() {
    if (!this.state.skipBroadcastClicked) {
      this.setState({
        skipBroadcast: !this.state.skipBroadcast,
        skipBroadcastClicked: true,
      });
    }
  }

  resetState = () => this.setState(this.initialState);

  getUnusedAddressIndex = () => this.props.account.addresses.filter(address => !address.isChange).length;

  getUnusedAddress = () => this.props.address.length ? this.props.address : getAddress(this.props.account.externalNode.derive(this.getUnusedAddressIndex()).publicKey);

  getUnusedAddressIndexChange = () => this.props.account.addresses.filter(address => address.isChange).length;
  
  getUnusedAddressChange = () => this.props.address.length ? this.props.address : getAddress(this.props.account.internalNode.derive(this.getUnusedAddressIndexChange()).publicKey);
  
  getOutputs = () => {
    const {
      balance,
      claimableAmount,
    } = this.props.account;

    const outputs =  {address: this.getUnusedAddress(), value: (balance + claimableAmount)};

    return outputs;
  };

  validate() {
    const amount = Number(this.props.amount);
    const balance = humanReadableSatoshis(this.props.balance);
    let error;

    if ((Number(amount) + 0.0002) > balance) {
      error = 'insufficient balance';
    } else if (Number(amount) < 0.0002) {
      error = 'amount is too small, min is 0.0001 ' + coin;
    } else if (!Number(amount) || Number(amount) < 0) {
      error = 'wrong amount format'
    }

    const validateAddress = checkPublicAddress(this.props.sendTo);
    if (!validateAddress) error = 'Invalid send to address';

    return error;
  }

  filterUtxos = (utxoListSimplified, utxoListDetailed) => {
    let utxos = [];
    
    for (let i = 0; i < utxoListSimplified.length; i++) {
      for (let j = 0; j < utxoListDetailed.length; j++) {
        if (utxoListDetailed[j].vout === utxoListSimplified[i].vout &&
            utxoListDetailed[j].txid === utxoListSimplified[i].txid) {
          utxos.push(utxoListDetailed[j]);
          break;
        }
      }
    }

    console.warn('filterUtxos', utxos);

    return utxos;
  }

  sendCoin = async () => {
    console.warn('send coin clicked');
    const isUserInputValid = this.validate();
    
    this.setState(prevState => ({
      ...this.initialState,
      isClaimingRewards: true,
      skipBroadcast: false,
    }));

    if (!isUserInputValid) {
      const {
        accountIndex,
        utxos,
      } = this.props.account;

      let currentAction;
      try {
        currentAction = 'connect';
        updateActionState(this, currentAction, 'loading');
        const ledgerIsAvailable = await ledger.isAvailable();
        if (!ledgerIsAvailable) {
          throw new Error((this.props.vendor === 'ledger' ? 'Ledger' : 'Trezor') + ' device is unavailable!');
        }
        updateActionState(this, currentAction, true);

        currentAction = 'confirmAddress';
        updateActionState(this, currentAction, 'loading');

        const {
          accountIndex,
          utxos,
        } = this.props.account;

        console.warn(utxos);
        let formattedUtxos = [];

        for (let i = 0; i < utxos.length; i++) {
          let utxo = utxos[i];
          console.warn(utxos[i].amount);
    
          utxo.amountSats = utxo.satoshis; 
          formattedUtxos.push(utxo);
        }
        console.warn('formatted utxos', formattedUtxos);
        
        const unusedAddress = this.getUnusedAddressChange();
        const derivationPath = `44'/141'/${accountIndex}'/1/${this.getUnusedAddressIndexChange()}`;
        const verify = true;
        const ledgerUnusedAddress = this.props.address.length ? this.props.address : await ledger.getAddress(derivationPath, false);
        console.warn(ledgerUnusedAddress);
        if (ledgerUnusedAddress !== unusedAddress) {
          throw new Error((this.props.vendor === 'ledger' ? 'Ledger' : 'Trezor') + ` derived address "${ledgerUnusedAddress}" doesn't match browser derived address "${unusedAddress}"`);
        }
        updateActionState(this, currentAction, true);

        currentAction = 'approveTransaction';
        updateActionState(this, currentAction, 'loading');

        const txData = transactionBuilder(
          KOMODO,
          toSats(this.props.amount),
          TX_FEE,
          this.props.sendTo,
          ledgerUnusedAddress,
          formattedUtxos
        );

        console.warn('txData', txData);

        const filteredUtxos = this.filterUtxos(txData.inputs, formattedUtxos);

        this.setState({
          ...this.initialState,
          isClaimingRewards: true,
          skipBroadcast: false,
          amount: txData.value,
          sendTo: txData.outputAddress,
          changeTo: txData.changeAddress,
          change: txData.change,
        });

        const rawtx = await ledger.createTransaction(
          filteredUtxos, txData.change > 0 ?
          [{address: txData.outputAddress, value: txData.value}, {address: txData.changeAddress, value: txData.change, derivationPath}] : [{address: txData.outputAddress, value: txData.value}]
        );

        console.warn('rawtx', rawtx);
        if (!rawtx) {
          throw new Error((this.props.vendor === 'ledger' ? 'Ledger' : 'Trezor') + ' failed to generate a valid transaction');
        }
        updateActionState(this, currentAction, true);
        
        if (this.state.skipBroadcast) {
          this.setState({
            success: 
              <React.Fragment>
                <span style={{
                  'padding': '10px 0',
                  'display': 'block'
                }}>Raw transaction:</span>
                <span style={{
                  'wordBreak': 'break-all',
                  'display': 'block',
                  'paddingLeft': '3px'
                }}>{rawtx}</span>
              </React.Fragment>
          });
          setTimeout(() => {
            this.props.syncData();
          }, 5000);
        } else {
          currentAction = 'broadcastTransaction';
          updateActionState(this, currentAction, 'loading');
          const {txid} = await blockchain.broadcast(rawtx);
          if (!txid || txid.length !== 64) {
            throw new Error('Unable to broadcast transaction');
          }
          updateActionState(this, currentAction, true);

          this.props.handleRewardClaim(txid);
          this.setState({
            success: <React.Fragment>Transaction ID: <TxidLink txid={txid}/></React.Fragment>
          });
          setTimeout(() => {
            this.props.syncData();
          }, 5000);
        }
      } catch (error) {
        console.warn(error);
        updateActionState(this, currentAction, false);
        this.setState({error: error.message});
      }
    } else {
      console.warn(isUserInputValid);
      updateActionState(this, 'connect', false);
      this.setState({error: isUserInputValid});
    }
  };

  render() {
    const {isClaimingRewards} = this.state;
    const isClaimableAmount = (this.props.account.claimableAmount > 0);
    const userOutput = this.getOutputs();
    const isNoBalace = Number(this.props.balance) <= 0;

    console.warn('this.props', this.props);

    return (
      <React.Fragment>
        <button
          className="button is-primary"
          disabled={isNoBalace || !this.props.sendTo || !this.props.amount}
          onClick={this.sendCoin}>
          {this.props.children}
        </button>
        <ActionListModal
          {...this.state}
          title="Send"
          handleClose={this.resetState}
          show={isClaimingRewards}>
          {!this.state.sendTo &&
            <p>Awaiting user input...</p>
          }
          {this.state.sendTo &&
            <p>Send <strong>{humanReadableSatoshis(this.state.amount)} {coin}</strong> to <strong>{this.state.sendTo}</strong></p>
          }
          {this.state.change > 0 &&
            this.state.isDebug &&
            <p>Send change <strong>{humanReadableSatoshis(this.state.change)} {coin}</strong> to address: <strong>{this.state.changeTo}</strong></p>
          }
          {this.state.isDebug &&
            <label className="switch" onClick={this.setSkipBroadcast}>
              <input type="checkbox" name="skipBroadcast" value={this.state.skipBroadcast} checked={this.state.skipBroadcast} readOnly />
              <span className="slider round"></span>
              <span className="slider-text">Don't broadcast transaction</span>
            </label>
          }
        </ActionListModal>
      </React.Fragment>
    );
  }
}

export default SendCoinButton;
