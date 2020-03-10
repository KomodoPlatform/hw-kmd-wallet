import React from 'react';
import getKomodoRewards from './lib/get-komodo-rewards';
import ledger from './lib/ledger';
import accountDiscovery from './lib/account-discovery';
import blockchain from './lib/blockchain';
import updateActionState from './lib/update-action-state';
import {TX_FEE} from './constants';
import ActionListModal from './ActionListModal';
import getAddress from './lib/get-address';

class ReceiveCoinButton extends React.Component {
  state = this.initialState;

  get initialState() {
    if (this.props.vendor) {
      ledger.setVendor(this.props.vendor);
    }

    return {
      isExtractingNewAddress: false,
      error: false,
      address: null,
      actions: {
        connect: {
          icon: 'fab fa-usb',
          description: this.props.vendor === 'ledger' ? <div>Connect and unlock your Ledger, then open the Komodo app on your device.</div> : <div>Connect and unlock your Trezor.</div>,
          state: null
        },
        confirmAddress: {
          icon: 'fas fa-microchip',
          description: <div>Approve a public key export request on your device.</div>,
          state: null
        }
      }
    };
  }

  resetState = () => this.setState(this.initialState);

  getUnusedAddressIndex = () => this.props.account.addresses.filter(address => !address.isChange).length;
  
  getUnusedAddress = () => this.props.address.length ? this.props.address : getAddress(this.props.account.externalNode.derive(this.getUnusedAddressIndex()).publicKey);

  getNewAddress = async () => {
    this.setState({
      ...this.initialState,
      address: null,
      isExtractingNewAddress: true,
    });

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

      const {accountIndex} = this.props.account;

      const unusedAddress = this.getUnusedAddress();
      const derivationPath = `44'/141'/${accountIndex}'/0/${this.getUnusedAddressIndex()}`;
      const verify = true;
      const ledgerUnusedAddress = this.props.address.length ? this.props.address : await ledger.getAddress(derivationPath, verify);
      if (ledgerUnusedAddress !== unusedAddress) {
        throw new Error((this.props.vendor === 'ledger' ? 'Ledger' : 'Trezor') + ` derived address "${ledgerUnusedAddress}" doesn't match browser derived address "${unusedAddress}"`);
      }
      updateActionState(this, currentAction, true);

      this.setState({
        address: unusedAddress,
      });
    } catch (error) {
      console.warn(error);
      updateActionState(this, currentAction, false);
      this.setState({error: error.message});
    }
  };

  render() {
    const {isExtractingNewAddress, actions, error} = this.state;

    return (
      <React.Fragment>
        <button className="button is-primary" onClick={this.getNewAddress}>
          {this.props.children}
        </button>
        <ActionListModal
          title="Receive coin"
          actions={actions}
          error={error}
          handleClose={this.resetState}
          show={isExtractingNewAddress}>
          <p>
            Exporting a public key from your {this.props.vendor === 'ledger' ? 'Ledger' : 'Trezor'} device. Please approve public key export request on your device.
          </p>
        </ActionListModal>
      </React.Fragment>
    );
  }

}

export default ReceiveCoinButton;
