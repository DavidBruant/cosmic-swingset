import harden from '@agoric/harden';
import guess37ContractSource from '../../contracts/guess37.js'

function build(E, log) {
  let sharedGame

  async function startup(host) {

    const guess37Installation = await E(host).install({start: guess37ContractSource})
    const { playerInvite } = await E(guess37Installation).spawn()
    const game = await E(host).redeem(playerInvite)

    sharedGame = game
  }

  async function createDemoClientBundle() {
    const chainBundle = {
      game: sharedGame
    };
    return harden(chainBundle);
  }

  return harden({ startup, createDemoClientBundle });
}

export default function setup(syscall, state, helpers) {
  return helpers.makeLiveSlots(
    syscall,
    state,
    E => build(E, helpers.log),
    helpers.vatID,
  );
}
